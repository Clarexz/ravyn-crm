import { z } from "zod";
import type { ToolDefinition } from "@/lib/agents/types";
import {
  assertOwned,
  check,
  dateIsOpen,
  getOwned,
  insertActivity,
  invalid,
  loadBlockingBookings,
  loadBusinessHours,
  nowOf,
  overlaps,
  pad,
  roundMoney,
  tzOf,
  withinBusinessHours,
  type BusinessHours,
  type Interval,
  type Row,
} from "./shared";
import type { ToolContext } from "@/lib/agents/types";
import { addDays, localIso, zonedToUtc } from "@/lib/industry/time";

const MAX_RANGE_DAYS = 31;
const DAY_MS = 86_400_000;
const MAX_SLOTS = 300;

const dateTime = z.iso.datetime({ offset: true });
const duration = z.number().int().min(5).max(480);

const availabilityInput = z
  .object({
    date_from: z.iso.date(),
    date_to: z.iso.date(),
    duration_minutes: duration.default(30),
    slot_step_minutes: z.number().int().min(5).max(240).default(30),
  })
  .strict()
  .refine((v) => v.date_to >= v.date_from, { message: "date_to no puede ser anterior a date_from", path: ["date_to"] })
  .refine(
    (v) => (Date.parse(v.date_to) - Date.parse(v.date_from)) / DAY_MS < MAX_RANGE_DAYS,
    { message: `El rango maximo es de ${MAX_RANGE_DAYS} dias`, path: ["date_to"] },
  );

function hm(totalMin: number): string {
  return `${pad(Math.floor(totalMin / 60))}:${pad(totalMin % 60)}`;
}

// Calcula slots libres. Funcion pura para poder reutilizarla y probarla.
export function computeFreeSlots(opts: {
  dateFrom: string;
  dateTo: string;
  durationMinutes: number;
  stepMinutes: number;
  hours: BusinessHours;
  busy: Interval[];
  now: Date;
}) {
  const days: Array<{ date: string; slots: Array<{ start: string; end: string; start_local: string }> }> = [];
  let total = 0;
  const tz = tzOf(opts.hours);
  for (let date = opts.dateFrom; date <= opts.dateTo; date = addDays(date, 1)) {
    const slots: Array<{ start: string; end: string; start_local: string }> = [];
    if (dateIsOpen(opts.hours, date)) {
      for (
        let m = opts.hours.startMin;
        m + opts.durationMinutes <= opts.hours.endMin && total < MAX_SLOTS;
        m += opts.stepMinutes
      ) {
        const start = zonedToUtc(date, m, tz);
        const slot: Interval = { start, end: new Date(start.getTime() + opts.durationMinutes * 60_000) };
        if (slot.start < opts.now) continue;
        if (opts.busy.some((b) => overlaps(slot, b))) continue;
        slots.push({ start: slot.start.toISOString(), end: slot.end.toISOString(), start_local: localIso(slot.start, tz) });
        total++;
      }
    }
    days.push({ date, slots });
  }
  return { days, total };
}

export const checkAvailability: ToolDefinition<z.infer<typeof availabilityInput>> = {
  name: "check_availability",
  description:
    "Consulta horarios libres en un rango de fechas (maximo 31 dias) segun el horario laboral de la organizacion y las citas no canceladas. Las horas start y end se expresan en UTC; start_local es la hora local de la organizacion (campo timezone).",
  input: availabilityInput,
  risk: "low",
  critical: false,
  async run(ctx, input) {
    const hours = await loadBusinessHours(ctx);
    const tz = tzOf(hours);
    const from = zonedToUtc(input.date_from, 0, tz);
    const to = zonedToUtc(addDays(input.date_to, 1), 0, tz);
    const busy = await loadBlockingBookings(ctx, from, to);
    const { days, total } = computeFreeSlots({
      dateFrom: input.date_from,
      dateTo: input.date_to,
      durationMinutes: input.duration_minutes,
      stepMinutes: input.slot_step_minutes,
      hours,
      busy,
      now: nowOf(ctx),
    });
    return {
      timezone: tz,
      duration_minutes: input.duration_minutes,
      business_hours: { start: hm(hours.startMin), end: hm(hours.endMin), days: hours.days },
      total_slots: total,
      days,
    };
  },
};

// Valida futuro, horario laboral y ausencia de solapes. Lanza INVALID_INPUT con motivo legible.
async function assertSlotAvailable(
  ctx: ToolContext,
  start: Date,
  minutes: number,
  excludeBookingId?: string,
): Promise<void> {
  if (start < nowOf(ctx)) throw invalid("La fecha de la cita ya paso.");
  const end = new Date(start.getTime() + minutes * 60_000);
  const hours = await loadBusinessHours(ctx);
  if (!withinBusinessHours(hours, start, end)) throw invalid("El horario solicitado esta fuera del horario laboral.");
  const busy = await loadBlockingBookings(ctx, start, end);
  const slot: Interval = { start, end };
  if (busy.some((b) => b.id !== excludeBookingId && overlaps(slot, b))) {
    throw invalid("El horario solicitado se solapa con otra cita.");
  }
}

const createInput = z
  .object({
    contact_id: z.uuid(),
    item_id: z.uuid().optional(),
    scheduled_at: dateTime,
    duration_minutes: duration.default(30),
    notes: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const createBooking: ToolDefinition<z.infer<typeof createInput>> = {
  name: "create_booking",
  description:
    "Agenda una cita para un contacto. Rechaza fechas pasadas, horarios fuera del horario laboral y solapes con otras citas.",
  input: createInput,
  risk: "medium",
  critical: false,
  async run(ctx, input) {
    await assertOwned(ctx, "contacts", input.contact_id, "el contacto");
    const item = input.item_id ? await getOwned(ctx, "items", input.item_id, "el item del catalogo") : null;
    const start = new Date(input.scheduled_at);
    await assertSlotAvailable(ctx, start, input.duration_minutes);
    const res = await ctx.db
      .from("bookings")
      .insert({
        organization_id: ctx.organizationId,
        contact_id: input.contact_id,
        item_id: item ? (item.id as string) : null,
        scheduled_at: start.toISOString(),
        duration_minutes: input.duration_minutes,
        status: "pending",
        service_snapshot: item ? (item.name as string) : null,
        cost_at_booking: item ? roundMoney(Number(item.price)) : null,
        notes: input.notes ?? null,
        source: "agent_booking",
      })
      .select()
      .single();
    const booking = check(res) as Row;
    await insertActivity(ctx, {
      type: "meeting",
      title: "Cita agendada por agente",
      contact_id: input.contact_id,
      booking_id: booking.id as string,
    });
    return { booking };
  },
};

const rescheduleInput = z
  .object({
    booking_id: z.uuid(),
    new_scheduled_at: dateTime,
    duration_minutes: duration.optional(),
  })
  .strict();

export const rescheduleBooking: ToolDefinition<z.infer<typeof rescheduleInput>> = {
  name: "reschedule_booking",
  description:
    "Mueve una cita pendiente o confirmada a un nuevo horario libre dentro del horario laboral. No sirve para citas canceladas o completadas.",
  input: rescheduleInput,
  risk: "medium",
  critical: false,
  async run(ctx, input) {
    const booking = await getOwned(ctx, "bookings", input.booking_id, "la cita");
    if (booking.status !== "pending" && booking.status !== "confirmed") {
      throw invalid("Solo se pueden reprogramar citas pendientes o confirmadas.");
    }
    const minutes = input.duration_minutes ?? (booking.duration_minutes as number);
    const start = new Date(input.new_scheduled_at);
    await assertSlotAvailable(ctx, start, minutes, input.booking_id);
    const previous = booking.scheduled_at as string;
    const res = await ctx.db
      .from("bookings")
      .update({ scheduled_at: start.toISOString(), duration_minutes: minutes })
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.booking_id)
      .select()
      .single();
    const updated = check(res) as Row;
    await insertActivity(ctx, {
      type: "meeting",
      title: "Cita reprogramada por agente",
      description: `De ${previous} a ${start.toISOString()}`,
      contact_id: (booking.contact_id as string | null) ?? null,
      booking_id: input.booking_id,
    });
    return { booking: updated, previous_scheduled_at: previous };
  },
};
