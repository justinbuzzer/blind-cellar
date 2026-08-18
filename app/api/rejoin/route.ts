import { NextRequest, NextResponse } from "next/server";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/routeHandlerClient";
import { RecoveryRedeemGlobalResponse, friendlyRpcError } from "@/lib/supabase/types";
import { generateSecureToken, hashToken } from "@/lib/tokens";
import { normalizeRecoveryCode } from "@/lib/rejoin";
import { participantCookieName, participantCookieOptions } from "@/lib/participantCookie";

/**
 * Session-less recovery-code redemption for the home page's "Rejoin a
 * tasting" entry point — see README "Session rejoin". Unlike
 * /api/join/recover, the caller supplies only the code, not a publicId;
 * calls redeem_recovery_code_global, which resolves the session from the
 * code itself. Same generic-failure collapsing (wrong code, expired,
 * already used, rate-limited) and the same fresh device-credential cookie
 * rotation as the session-scoped route, just keyed by the *resolved*
 * publicId rather than a caller-supplied one.
 */
function clientIpFromRequest(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseRouteHandlerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see SUPABASE_SETUP.md).",
      },
      { status: 500 }
    );
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  if (!code) {
    return NextResponse.json(
      { error: "That code could not be used. Check it and try again." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const newDeviceToken = generateSecureToken();

  const { data, error } = await supabase.rpc("redeem_recovery_code_global", {
    p_code_hash: hashToken(normalizeRecoveryCode(code)),
    p_new_device_token_hash: hashToken(newDeviceToken),
    p_client_ip: clientIpFromRequest(request),
  });

  if (error) {
    const status = error.message?.includes("rate_limited") ? 429 : 400;
    return NextResponse.json(
      { error: friendlyRpcError(error) },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as RecoveryRedeemGlobalResponse;

  const response = NextResponse.json(
    {
      guestId: row.guest_id,
      guestToken: row.guest_token,
      displayName: row.display_name,
      publicId: row.public_id,
      status: row.status,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  response.cookies.set(
    participantCookieName(row.public_id),
    newDeviceToken,
    participantCookieOptions()
  );
  return response;
}
