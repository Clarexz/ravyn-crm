// STUB del contrato de la base simulada. La implementacion real (motor en memoria + datos
// de ejemplo) la escribe el agente de datos de demo. No cambiar las firmas exportadas.
import type { SupabaseClient } from "@supabase/supabase-js";

// Base en memoria con la API de supabase-js que usa la app; singleton por proceso
// (guardado en globalThis para sobrevivir al hot reload).
export function getDemoDb(): SupabaseClient {
  throw new Error("getDemoDb: no implementado");
}

// Restaura los datos de ejemplo originales (util para pruebas y para el boton "Reiniciar demo").
export function resetDemoDb(): void {
  throw new Error("resetDemoDb: no implementado");
}
