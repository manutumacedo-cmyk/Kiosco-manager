import { createClient } from "@supabase/supabase-js";

// Cliente server-only con service role key — bypasea RLS.
// NUNCA importar en componentes cliente ni en middleware (Edge Runtime).
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
