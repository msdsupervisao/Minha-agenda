import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

export function serviceConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

/** Client com service role (bypassa RLS). Uso EXCLUSIVO server-side (ex.: cron de lembretes). */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Service role não configurado.');
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
