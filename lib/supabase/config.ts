export type SupabasePublicConfig = {
  url: string | null;
  publishableKey: string | null;
  configured: boolean;
};

export function getSupabasePublicConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SupabasePublicConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || null;
  return { url, publishableKey, configured: Boolean(url && publishableKey) };
}

export function requireSupabasePublicConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const config = getSupabasePublicConfig(env);
  if (!config.configured || !config.url || !config.publishableKey) {
    throw new Error('Supabase não configurado. Defina a URL e a publishable key.');
  }
  return { url: config.url, publishableKey: config.publishableKey };
}
