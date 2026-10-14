import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingToAppointment } from "@/lib/supabase/mappers";
import type { Booking } from "@/types/database";

const WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

// Escapes LIKE wildcards so user-supplied names match literally.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function POST(req: Request) {
  // Same shared-secret check as appointment-updated (H-01).
  const incomingSecret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || incomingSecret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Extraer los datos del Webhook de n8n
    const body = await req.json();
    const { 
      cita_id, 
      nombre, 
      whatsapp, 
      servicio, 
      sucursal, 
      inicio, 
      fin,
      correo,
      organization_id
    } = body;

    if (!nombre || !inicio) {
      return NextResponse.json({ error: "Faltan campos requeridos (nombre, inicio)" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 2. Resolver la organizacion: por id explicito o por nombre exacto y unico.
    // Sin fallback: si no se resuelve a una sola organizacion se rechaza (H-01, H-06).
    let organizationId = "";
    if (typeof organization_id === "string" && organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("id", organization_id)
        .maybeSingle();
      if (org) organizationId = org.id;
    } else if (typeof sucursal === "string" && sucursal.trim()) {
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id")
        .ilike("name", escapeLike(sucursal.trim()))
        .limit(2);
      if (orgs && orgs.length === 1) organizationId = orgs[0].id;
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "No se pudo resolver la organizacion (envie organization_id o un nombre de sucursal unico)" },
        { status: 400 },
      );
    }

    // 3. Buscar paciente existente por WhatsApp o Correo, o crearlo si no existe
    let contactId = "";
    
    // Intento 1: Buscar por teléfono
    if (whatsapp) {
      const { data: pByPhone } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("phone", whatsapp)
        .single();
      if (pByPhone) contactId = pByPhone.id;
    }
    
    // Intento 2: Si no hay por teléfono, buscar por nombre exacto
    if (!contactId) {
      const { data: pByName } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("full_name", escapeLike(String(nombre)))
        .single();
      if (pByName) contactId = pByName.id;
    }

    // Intento 3: Si no existe, lo creamos
    if (!contactId) {
      const { data: newContact, error: pError } = await supabase
        .from("contacts")
        .insert({
          organization_id: organizationId,
          full_name: nombre,
          phone: whatsapp || null,
          email: correo || null,
          source: "whatsapp" // O el origen que determine n8n
        })
        .select("id")
        .single();
        
      if (pError) throw pError;
      if (newContact) contactId = newContact.id;
    }

    // 4. Calcular duración en base a inicio y fin
    let durationMinutes = 30; // default
    if (inicio && fin) {
      const start = new Date(inicio).getTime();
      const end = new Date(fin).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        durationMinutes = Math.round((end - start) / 60000);
      }
    }

    // 5. Intentar buscar el servicio en el catálogo para asignar el ID y costo (opcional)
    let itemId = null;
    let cost = null;
    if (servicio) {
      const { data: srv } = await supabase
        .from("items")
        .select("id, price")
        .eq("type", "service")
        .eq("organization_id", organizationId)
        .ilike("name", `%${escapeLike(String(servicio))}%`)
        .single();
        
      if (srv) {
        itemId = srv.id;
        cost = srv.price;
      }
    }

    // 6. Insertar la cita en la base de datos local
    const { data: appointment, error: aptError } = await supabase
      .from("bookings")
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        scheduled_at: new Date(inicio).toISOString(),
        duration_minutes: durationMinutes,
        status: "confirmed", // Asumimos que si viene de n8n ya está confirmada
        service_snapshot: servicio || "Consulta",
        item_id: itemId,
        cost_at_booking: cost,
        source: "whatsapp", // Identificamos que entró por automatización
        n8n_execution_id: cita_id // Guardamos la referencia de n8n
      })
      .select()
      .single();

    if (aptError) throw aptError;

    // Supabase automáticamente emitirá el evento INSERT por WebSockets a través de Realtime
    // No necesitamos hacer nada extra aquí para actualizar la interfaz.

    return NextResponse.json({ success: true, appointment: bookingToAppointment(appointment as Booking) });

  } catch (error: unknown) {
    console.error("Error procesando webhook de n8n:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
