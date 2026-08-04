"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

let browserClient: SupabaseClient | null = null;

/**
 * Lazily-created singleton Supabase client for use in Client Components.
 * Always uses the public anon key — every privileged operation is enforced
 * inside Postgres (RPC functions + RLS), not by this client's credentials.
 * Returns null when the required env vars aren't configured, so callers can
 * render a "Supabase isn't configured" state instead of crashing.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  if (!browserClient) {
    browserClient = createClient(env.url, env.anonKey);
  }
  return browserClient;
}
