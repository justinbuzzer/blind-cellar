import { NextRequest, NextResponse } from "next/server";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/routeHandlerClient";
import { RecoveryRedeemResponse, friendlyRpcError } from "@/lib/supabase/types";
import { generateSecureToken, hashToken } from "@/lib/tokens";
import { normalizeRecoveryCode } from "@/lib/rejoin";
import { participantCookieName, participantCookieOptions } from "@/lib/participantCookie";

/**
 * Redeems a one-time guest recovery code for cross-device rejoin — see
 * README "Session rejoin" — "Guest recovery flow". Every failure (wrong
 * code, expired, already used, wrong session, rate-limited) is collapsed
 * into the same generic response; the raw code is never echoed back or
 * logged. On success, rotates in a fresh device credential cookie for this
 * session only.
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

  let body: { publicId?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const publicId = typeof body.publicId === "string" ? body.publicId : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!publicId || !code) {
    return NextResponse.json(
      { error: "That code could not be used. Check it and try again." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const newDeviceToken = generateSecureToken();

  const { data, error } = await supabase.rpc("redeem_recovery_code", {
    p_public_id: publicId,
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

  const row = (Array.isArray(data) ? data[0] : data) as RecoveryRedeemResponse;

  const response = NextResponse.json(
    { guestId: row.guest_id, guestToken: row.guest_token, displayName: row.display_name },
    { headers: { "Cache-Control": "no-store" } }
  );
  response.cookies.set(
    participantCookieName(publicId),
    newDeviceToken,
    participantCookieOptions()
  );
  return response;
}
