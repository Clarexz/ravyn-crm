import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
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
      correo
    } = body;

    if (!nombre || !inicio) {
      return NextResponse.json({ error: "Faltan campos requeridos (nombre, inicio)" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 2. Buscar la sucursal por nombre para obtener el clinic_id
    let clinicId = "";
    if (sucursal) {
      const { data: clinic } = await supabase
        .from("clinics")
        .select("id")
        .ilike("name", `%${sucursal}%`)
        .single();
        
      if (clinic) clinicId = clinic.id;
    }
    
    // Si no encuentra la sucursal por nombre, toma la primera disponible (fallback)
    if (!clinicId) {
       const { data: firstClinic } = await supabase.from("clinics").select("id").limit(1).single();
       if (firstClinic) clinicId = firstClinic.id;
       else return NextResponse.json({ error: "No se encontró ninguna clínica configurada" }, { status: 500 });
    }

    // 3. Buscar paciente existente por WhatsApp o Correo, o crearlo si no existe
    let patientId = "";
    
    // Intento 1: Buscar por teléfono
    if (whatsapp) {
      const { data: pByPhone } = await supabase
        .from("patients")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("phone", whatsapp)
        .single();
      if (pByPhone) patientId = pByPhone.id;
    }
    
    // Intento 2: Si no hay por teléfono, buscar por nombre exacto
    if (!patientId) {
      const { data: pByName } = await supabase
        .from("patients")
        .select("id")
        .eq("clinic_id", clinicId)
        .ilike("full_name", nombre)
        .single();
      if (pByName) patientId = pByName.id;
    }

    // Intento 3: Si no existe, lo creamos
    if (!patientId) {
      const { data: newPatient, error: pError } = await supabase
        .from("patients")
        .insert({
          clinic_id: clinicId,
          full_name: nombre,
          phone: whatsapp || null,
          email: correo || null,
          source: "whatsapp" // O el origen que determine n8n
        })
        .select("id")
        .single();
        
      if (pError) throw pError;
      if (newPatient) patientId = newPatient.id;
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
    let serviceId = null;
    let cost = null;
    if (servicio) {
      const { data: srv } = await supabase
        .from("services")
        .select("id, cost")
        .eq("clinic_id", clinicId)
        .ilike("name", `%${servicio}%`)
        .single();
        
      if (srv) {
        serviceId = srv.id;
        cost = srv.cost;
      }
    }

    // 6. Insertar la cita en la base de datos local
    const { data: appointment, error: aptError } = await supabase
      .from("appointments")
      .insert({
        clinic_id: clinicId,
        patient_id: patientId,
        scheduled_at: new Date(inicio).toISOString(),
        duration_minutes: durationMinutes,
        status: "confirmed", // Asumimos que si viene de n8n ya está confirmada
        service: servicio || "Consulta",
        service_id: serviceId,
        cost_at_booking: cost,
        source: "whatsapp", // Identificamos que entró por automatización
        n8n_execution_id: cita_id // Guardamos la referencia de n8n
      })
      .select()
      .single();

    if (aptError) throw aptError;

    // Supabase automáticamente emitirá el evento INSERT por WebSockets a través de Realtime
    // No necesitamos hacer nada extra aquí para actualizar la interfaz.

    return NextResponse.json({ success: true, appointment });

  } catch (error: unknown) {
    console.error("Error procesando webhook de n8n:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
