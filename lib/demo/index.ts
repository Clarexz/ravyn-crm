// Base de datos simulada del modo demo (motor en memoria + datos de ejemplo).
// Dueno: agente de datos de demo. Las firmas getDemoDb y resetDemoDb son el contrato con el resto de la app.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DemoDb } from "./engine";
import { seedDemoData } from "./seed";

export { DemoDb, DemoAuthError, SCHEMA, TABLE_ORDER } from "./engine";
export type { AuthUser, DemoDbOptions, Row } from "./engine";
export { seedDemoData, DEMO_STAFF_IDS, DEMO_OTHER_USER_ID } from "./seed";
export type { DemoSeedSummary } from "./seed";

const GLOBAL_KEY = "__ravynDemoDb";
type Holder = { [GLOBAL_KEY]?: DemoDb };

function holder(): Holder {
  return globalThis as unknown as Holder;
}

// Instancia interna (singleton por proceso en globalThis; sobrevive al hot reload), sembrada al primer uso.
export function getDemoEngine(): DemoDb {
  const h = holder();
  let db = h[GLOBAL_KEY];
  if (!db) {
    db = new DemoDb();
    seedDemoData(db);
    h[GLOBAL_KEY] = db;
  }
  return db;
}

// Base en memoria con la API de supabase-js que usa la app; singleton por proceso
// (guardado en globalThis para sobrevivir al hot reload).
export function getDemoDb(): SupabaseClient {
  return getDemoEngine().asClient();
}

// Restaura los datos de ejemplo originales (util para pruebas y para el boton "Reiniciar demo").
// Conserva la misma instancia: los clientes ya entregados siguen siendo validos.
export function resetDemoDb(): void {
  const db = getDemoEngine();
  db.clear();
  seedDemoData(db, db.now());
}
