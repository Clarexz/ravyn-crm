import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // En un escenario real, aquí buscaríamos la cita en la base de datos
    // y llamaríamos al webhook de n8n.
    // Por ahora, simularemos éxito.
    
    console.log(`Enviando recordatorio para la cita: ${id}`);
    
    // Simulamos un retraso de red
    await new Promise((resolve) => setTimeout(resolve, 500));

    return NextResponse.json({
      message: "Recordatorio enviado correctamente",
      success: true,
    });
  } catch (error) {
    console.error("Error al enviar recordatorio:", error);
    return NextResponse.json(
      { error: "Error al procesar el recordatorio" },
      { status: 500 }
    );
  }
}
