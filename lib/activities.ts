// Historial de actividades con autor (Fase 3). Toda consulta filtra por organization_id.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Activity } from "@/types/database";

export type ActivityWithAuthor = Activity & { author_name: string | null; assignee_name: string | null };

export type ActivityFilters = { contactId?: string; bookingId?: string; limit?: number };

export async function listActivities(
  db: SupabaseClient,
  organizationId: string,
  filters: ActivityFilters,
): Promise<ActivityWithAuthor[] | null> {
  try {
    let q = db.from("activities").select("*").eq("organization_id", organizationId);
    if (filters.contactId) q = q.eq("contact_id", filters.contactId);
    if (filters.bookingId) q = q.eq("booking_id", filters.bookingId);
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const res = await q.order("created_at", { ascending: false }).limit(limit);
    if (res.error) return null;
    const rows = (res.data ?? []) as Activity[];

    const humanIds = Array.from(new Set(rows.filter((a) => a.performed_by_type === "human").map((a) => a.performed_by_id)));
    const needsNames = humanIds.length > 0 || rows.some((a) => a.assigned_to);
    const names = new Map<string, string>();
    if (needsNames) {
      const users = await db.from("users").select("id, full_name").eq("organization_id", organizationId);
      if (!users.error) {
        for (const u of (users.data ?? []) as Array<{ id: string; full_name: string }>) names.set(u.id, u.full_name);
      }
    }
    return rows.map((a) => ({
      ...a,
      author_name: a.performed_by_type === "human" ? (names.get(a.performed_by_id) ?? null) : null,
      // D-19: nombre de la persona a quien se asigno la tarea (solo usuarios de la misma organizacion).
      assignee_name: a.assigned_to ? (names.get(a.assigned_to) ?? null) : null,
    }));
  } catch {
    return null;
  }
}
