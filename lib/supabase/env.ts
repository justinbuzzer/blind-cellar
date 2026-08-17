export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/** Reads the public Supabase env vars, or null if either is missing/unset. */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Reads the service-role key (see README "Bottle photos") — deliberately
 * NOT prefixed `NEXT_PUBLIC_`, since it must never reach the browser bundle.
 * Only ever read from `lib/supabase/serviceClient.ts`, which only ever gets
 * imported from a Route Handler. Returns null if unset, same convention as
 * getSupabaseEnv() above.
 */
export function getSupabaseServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}
