import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import { BUDGET_SELECT, budgetFromRow } from "@/lib/budgets/mappers";

type ServiceInput = {
  service_id?: string | null;
  name: string;
  sessions: number;
  unit_price: number;
  is_manual_price: boolean;
};

type MemberInput = {
  full_name: string;
  relationship: string;
  services?: ServiceInput[];
};

export async function POST(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let createdBudgetId: string | null = null;

  try {
    const body = await request.json();
    const {
      responsible_id,
      responsible_name,
      responsible_phone,
      responsible_email,
      status = "active",
      subtotal,
      discount_value,
      discount_type,
      total,
      validity_days,
      payment_method,
      doctor_notes,
      patient_notes,
    } = body;
    // H-07: numeric inputs come from the client; reject non-finite or negative values.
    const numericFields = { subtotal, discount_value, total, validity_days };
    for (const [field, value] of Object.entries(numericFields)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return NextResponse.json({ error: `Valor invalido en ${field}` }, { status: 400 });
      }
    }
    if (!Number.isInteger(validity_days) || validity_days < 1 || validity_days > 365) {
      return NextResponse.json({ error: "validity_days debe ser un entero entre 1 y 365" }, { status: 400 });
    }
    const members: MemberInput[] = Array.isArray(body.members) ? body.members : [];
    const organizationId = ctx.organizationId;

    // Validacion de pertenencia a la organizacion (responsable y servicios)
    const responsibleId: string | null = responsible_id || null;
    if (responsibleId) {
      const { data: contact, error } = await ctx.db
        .from("contacts")
        .select("id")
        .eq("id", responsibleId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!contact) {
        return NextResponse.json({ error: "El responsable no pertenece a la organizacion" }, { status: 400 });
      }
    }

    const serviceIds = Array.from(
      new Set(
        members.flatMap((m) => (m.services ?? []).map((s) => s.service_id).filter((v): v is string => !!v)),
      ),
    );
    if (serviceIds.length > 0) {
      const { data: items, error } = await ctx.db
        .from("items")
        .select("id")
        .in("id", serviceIds)
        .eq("organization_id", organizationId);
      if (error) throw error;
      if ((items ?? []).length !== serviceIds.length) {
        return NextResponse.json({ error: "Algun servicio no pertenece a la organizacion" }, { status: 400 });
      }
    }

    // 1. Crear el presupuesto principal (budget_number lo asigna la base)
    const { data: budget, error: budgetError } = await ctx.db
      .from("budgets")
      .insert({
        organization_id: organizationId,
        responsible_id: responsibleId,
        responsible_name,
        responsible_phone,
        responsible_email,
        status,
        subtotal,
        discount_value,
        discount_type,
        total,
        validity_days,
        payment_method,
        doctor_notes,
        patient_notes,
        expires_at: new Date(Date.now() + validity_days * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (budgetError) throw budgetError;
    createdBudgetId = budget.id;

    // 2. Insertar los integrantes y sus servicios
    for (const member of members) {
      const { data: insertedMember, error: memberError } = await ctx.db
        .from("budget_members")
        .insert({
          organization_id: organizationId,
          budget_id: budget.id,
          full_name: member.full_name,
          relationship: member.relationship,
        })
        .select()
        .single();

      if (memberError) throw memberError;

      if (member.services && member.services.length > 0) {
        const servicesToInsert = member.services.map((s) => ({
          organization_id: organizationId,
          budget_member_id: insertedMember.id,
          service_id: s.service_id || null,
          name: s.name,
          sessions: s.sessions,
          unit_price: s.unit_price,
          is_manual_price: s.is_manual_price,
        }));

        const { error: servicesError } = await ctx.db.from("budget_services").insert(servicesToInsert);
        if (servicesError) throw servicesError;
      }
    }

    return NextResponse.json({ success: true, budgetId: budget.id });
  } catch (error: unknown) {
    // Compensacion: borrar el presupuesto creado (miembros y servicios caen por ON DELETE CASCADE)
    if (createdBudgetId) {
      const { error: cleanupError } = await ctx.db
        .from("budgets")
        .delete()
        .eq("id", createdBudgetId)
        .eq("organization_id", ctx.organizationId);
      if (cleanupError) console.error("[POST /api/budgets] Error al compensar:", cleanupError);
    }
    console.error("[POST /api/budgets] Error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { data, error } = await ctx.db
      .from("budgets")
      .select(BUDGET_SELECT)
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json((data ?? []).map((r) => budgetFromRow(r as unknown as Record<string, unknown>)));
  } catch (error: unknown) {
    console.error("[GET /api/budgets] Error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
