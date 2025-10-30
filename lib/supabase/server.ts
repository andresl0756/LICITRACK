import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let cachedAdmin: SupabaseClient<Database> | null = null;

function ensureAdmin(): SupabaseClient<Database> {
  if (cachedAdmin) return cachedAdmin;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required at runtime.');
  }

  cachedAdmin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedAdmin;
}

// Compatibilidad con el código existente: objeto proxy que inicializa en el primer acceso.
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const client = ensureAdmin() as any;
    return client[prop as keyof typeof client];
  },
}) as SupabaseClient<Database>;

// Export opcional para quien prefiera llamar explícitamente
export function getSupabaseAdmin(): SupabaseClient<Database> {
  return ensureAdmin();
}