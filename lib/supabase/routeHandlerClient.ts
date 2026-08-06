import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/**
 * Cookie-aware Supabase client for Route Handlers that need to know the
 * caller's Auth identity (auth.uid()) — see README "Account-linked tasting
 * records". Deliberately separate from lib/supabase/server.ts, which stays a
 * plain anon-key client with zero cookie awareness, used by every existing
 * host-token route: those routes never needed to know who (if anyone) is
 * signed in, and changing that shared client would have been a much bigger,
 * riskier edit than adding this new one alongside it.
 *
 * Still only ever uses the public anon key — Supabase Auth's own row-level
 * security (auth.uid() inside the SECURITY DEFINER claim RPC) is what makes
 * this safe, not an elevated key. Returns null when env vars aren't
 * configured, matching every other Supabase client helper in this app.
 */
export function getSupabaseRouteHandlerClient() {
  const env = getSupabaseEnv();
  if (!env) return null;

  const cookieStore = cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Route Handlers can normally set cookies; this only guards a
          // context where the response has already been sent.
        }
      },
    },
  });
}
