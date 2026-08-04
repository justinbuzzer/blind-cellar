import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

/**
 * Creates a fresh Supabase client for use in Server Components and Route
 * Handlers. Uses the public anon key, same as the browser client — this app
 * has no service-role usage. Server-side privileged operations (host
 * mutations) are still safe because they go through SECURITY DEFINER
 * Postgres functions that validate the host token themselves; running the
 * call from the server just keeps the token out of client-side network
 * inspection of the Supabase REST endpoint directly.
 * Returns null when env vars aren't configured.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false },
    global: {
      // Next.js's patched `fetch` caches requests by default, even on a
      // `force-dynamic` route segment, unless each call opts out
      // explicitly — otherwise the host control page can show stale
      // bottle/guest counts after a fresh navigation.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
