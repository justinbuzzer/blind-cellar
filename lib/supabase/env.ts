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
