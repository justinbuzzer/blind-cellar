import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "./env";

/**
 * Service-role Supabase client (see README "Bottle photos") — the one
 * exception to this app's "no service-role usage" rule (see
 * lib/supabase/server.ts). Bypasses Storage RLS entirely, which is exactly
 * why it exists: an anonymous tasting contributor has no `auth.uid()` for
 * Storage RLS to ever check, so minting a signed upload URL for their photo
 * has to happen server-side with elevated privileges instead.
 *
 * SERVER-ONLY. Only ever import this from a Route Handler
 * (app/api/register/photo-upload-url/route.ts) — never from a "use client"
 * file, and never reused for anything beyond signed-upload-URL generation.
 * Returns null when the service-role key isn't configured, same convention
 * as every other Supabase client helper in this app.
 */
export function getSupabaseServiceClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!env || !serviceRoleKey) return null;
  return createClient(env.url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
