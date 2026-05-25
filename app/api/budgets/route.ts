import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/supabase/auth";
import type { BudgetStatus } from "@/types/database";

export async function POST(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

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
      members 
    } = body;

    // 1. Crear el presupuesto principal
    const { data: budget, error: budgetError } = await ctx.db
      .from("budgets")
      .insert({
        clinic_id: ctx.clinicId,
        responsible_id,
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
        expires_at: new Date(Date.now() + validity_days * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (budgetError) throw budgetError;

    // 2. Insertar los integrantes y sus servicios
    for (const member of members) {
      const { data: insertedMember, error: memberError } = await ctx.db
        .from("budget_members")
        .insert({
          budget_id: budget.id,
          full_name: member.full_name,
          relationship: member.relationship
        })
        .select()
        .single();

      if (memberError) throw memberError;

      if (member.services && member.services.length > 0) {
        const servicesToInsert = member.services.map((s: any) => ({
          budget_member_id: insertedMember.id,
          service_id: s.service_id || null,
          name: s.name,
          sessions: s.sessions,
          unit_price: s.unit_price,
          is_manual_price: s.is_manual_price
        }));

        const { error: servicesError } = await ctx.db
          .from("budget_services")
          .insert(servicesToInsert);

        if (servicesError) throw servicesError;
      }
    }

    return NextResponse.json({ success: true, budgetId: budget.id });

  } catch (error: any) {
    console.error("[POST /api/budgets] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { data, error } = await ctx.db
      .from("budgets")
      .select(`
        *,
        members:budget_members(
          *,
          services:budget_services(*)
        )
      `)
      .eq("clinic_id", ctx.clinicId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[GET /api/budgets] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
