"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

let browserClient: SupabaseClient | null = null;

/**
 * Lazily-created singleton Supabase client for use in Client Components.
 * Always uses the public anon key — every privileged tasting operation
 * (host/guest token flows) is still enforced inside Postgres (RPC functions
 * + RLS), not by this client's credentials; that is completely unchanged by
 * Supabase Auth. What did change: this now uses @supabase/ssr's cookie-based
 * session storage instead of plain localStorage, so a signed-in user's Auth
 * session is also visible to server contexts that read cookies (see
 * middleware.ts) — see README "Accounts" for the full picture. Every
 * existing anonymous host/guest RPC call made through this client behaves
 * identically whether or not a user happens to be signed in.
 * Returns null when the required env vars aren't configured, so callers can
 * render a "Supabase isn't configured" state instead of crashing.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(env.url, env.anonKey);
  }
  return browserClient;
}
