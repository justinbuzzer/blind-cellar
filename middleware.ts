import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase's official session-refresh pattern for @supabase/ssr — this is
 * the only thing this middleware does. It never redirects and never blocks
 * a request: every existing anonymous host/guest/QR/join route, and every
 * Realtime connection (which the browser opens directly to Supabase, never
 * through this app's own server), is completely unaffected. Route protection
 * for /account is handled client-side on that page instead (see README
 * "Accounts"), so this file stays this small and low-risk.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Triggers a token refresh (and the corresponding Set-Cookie above) when
  // the access token is near/past expiry. The result is intentionally
  // unused — this middleware never gates access on it.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
