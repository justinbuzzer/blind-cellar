import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

// Supabase's own SSR cookie helper (createServerClient/createBrowserClient)
// names its auth cookie `sb-<project-ref>-auth-token`, chunked as
// `sb-<project-ref>-auth-token.0`, `.1`, etc. for large tokens — see
// @supabase/ssr's own storageKey documentation. Matching that prefix (rather
// than re-deriving the project ref from the URL ourselves) tracks whatever
// Supabase actually wrote, without this file needing to reimplement its
// internal naming.
const SUPABASE_AUTH_COOKIE_PREFIX_RE = /^sb-.*-auth-token/;

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

  // Almost every request in this app carries no Supabase Auth session at
  // all — hosting/joining/guessing/rating are entirely anonymous host/guest
  // tokens (see README "Security model, in plain English"), and this
  // middleware's matcher already covers every page and API route, including
  // the 5-8s poll requests several pages run continuously. Skipping the
  // auth-server round trip below when there's no Supabase auth cookie to
  // refresh in the first place avoids paying that latency on every one of
  // those requests for the common case. A visitor who has actually signed in
  // (see "Accounts") always has this cookie, so their session-refresh
  // behaviour is completely unchanged.
  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some((cookie) => SUPABASE_AUTH_COOKIE_PREFIX_RE.test(cookie.name));
  if (!hasSupabaseAuthCookie) return response;

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
