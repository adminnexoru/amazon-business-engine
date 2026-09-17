import { createClient } from '@supabase/supabase-js';

// Cliente server-only: usa la service_role key, que ignora RLS.
// NUNCA importar este módulo desde un Client Component ni exponer la key al navegador.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});
