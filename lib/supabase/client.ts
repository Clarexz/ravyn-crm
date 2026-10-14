import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/demo/config";

// Demo mode: the browser has no Supabase. Auth calls succeed and realtime channels never emit;
// data always comes from the server (docs/v2/decisiones.md, D-08).
function createDemoBrowserClient(): SupabaseClient {
  const channel = {
    on() {
      return channel;
    },
    subscribe() {
      return channel;
    },
  };
  const queryStub = {
    select: () => queryStub,
    eq: () => queryStub,
    single: async () => ({ data: null, error: null }),
  };
  return {
    auth: {
      signInWithPassword: async () => ({ data: {}, error: null }),
      signOut: async () => ({ error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    channel: () => channel,
    removeChannel: () => undefined,
    from: () => queryStub,
  } as unknown as SupabaseClient;
}

export function createClient(): SupabaseClient {
  if (isDemoMode()) return createDemoBrowserClient();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
