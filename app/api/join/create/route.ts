import { NextRequest, NextResponse } from "next/server";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/routeHandlerClient";
import {
  JoinAsAccountResponse,
  JoinSessionResponse,
  friendlyRpcError,
} from "@/lib/supabase/types";
import { generateSecureToken, generateRecoveryCode, hashToken } from "@/lib/tokens";
import { normalizeRecoveryCode } from "@/lib/rejoin";
import { participantCookieName, participantCookieOptions } from "@/lib/participantCookie";

/**
 * Joins a tasting session — see README "Session rejoin". Branches on the
 * caller's Supabase Auth state (never a client-supplied flag): a signed-in
 * account with no existing membership joins via join_tasting_session_as_
 * account (no form, no new credential — the account session is already
 * sufficient); everyone else joins as a guest via join_tasting_session,
 * which also mints a device credential (set here as an HttpOnly cookie) and
 * a one-time recovery code (returned once in the response body, never
 * stored anywhere client-side beyond the confirmation screen's React state).
 *
 * A signed-in user who deliberately clicks "Join as a guest" instead of
 * "Continue with my account" is NOT auto-linked here — that would silently
 * override their explicit choice. (Contrast with the pre-existing
 * account_tasting_records auto-claim on the old join flow, which this
 * route replaces for the guest path.)
 */
function clientIpFromRequest(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

function statusForJoinError(message: string | undefined): number {
  const raw = message ?? "";
  if (raw.includes("session_not_found")) return 404;
  if (raw.includes("not_signed_in")) return 401;
  if (raw.includes("rate_limited")) return 429;
  if (
    raw.includes("session_already_revealed") ||
    raw.includes("duplicate_guest_name")
  ) {
    return 409;
  }
  if (raw.includes("display_name_required") || raw.includes("display_name_too_long")) {
    return 400;
  }
  if (raw.includes("invalid_starting_credits") || raw.includes("betting_roster_locked")) {
    return 400;
  }
  return 500;
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

  let body: { publicId?: string; displayName?: string; asGuest?: boolean; startingCredits?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const publicId = typeof body.publicId === "string" ? body.publicId : "";
  if (!publicId) {
    return NextResponse.json({ error: "Missing tasting." }, { status: 400 });
  }

  // Betting sub-mode only (see README "Tasting modes" — "Betting") — null
  // for every non-betting session, which the RPCs below simply ignore.
  const startingCredits =
    typeof body.startingCredits === "number" && Number.isFinite(body.startingCredits)
      ? Math.trunc(body.startingCredits)
      : null;

  const { data: userData } = await supabase.auth.getUser();

  // `asGuest` lets a signed-in visitor deliberately choose "Join as a
  // guest" instead of "Continue with my account" — see README "Session
  // rejoin". Without this override, a signed-in user could never actually
  // reach the guest path, silently contradicting their explicit choice.
  if (userData.user && !body.asGuest) {
    const { data, error } = await supabase.rpc("join_tasting_session_as_account", {
      p_public_id: publicId,
      p_starting_credits: startingCredits,
    });
    if (error) {
      return NextResponse.json(
        { error: friendlyRpcError(error) },
        { status: statusForJoinError(error.message), headers: { "Cache-Control": "no-store" } }
      );
    }
    const row = (Array.isArray(data) ? data[0] : data) as JoinAsAccountResponse;
    return NextResponse.json(
      {
        mode: "account",
        guestId: row.guest_id,
        guestToken: row.guest_token,
        displayName: row.display_name,
        alreadyMember: row.already_member,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

  const deviceToken = generateSecureToken();
  const recoveryCode = generateRecoveryCode();
  const deviceTokenHash = hashToken(deviceToken);
  const recoveryCodeHash = hashToken(normalizeRecoveryCode(recoveryCode));

  const { data, error } = await supabase.rpc("join_tasting_session", {
    p_public_id: publicId,
    p_display_name: displayName,
    p_device_token_hash: deviceTokenHash,
    p_recovery_code_hash: recoveryCodeHash,
    p_client_ip: clientIpFromRequest(request),
    p_starting_credits: startingCredits,
  });

  if (error) {
    return NextResponse.json(
      { error: friendlyRpcError(error) },
      { status: statusForJoinError(error.message), headers: { "Cache-Control": "no-store" } }
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as JoinSessionResponse;

  const response = NextResponse.json(
    {
      mode: "guest",
      guestId: row.guest_id,
      guestToken: row.guest_token,
      displayName: row.display_name,
      recoveryCode,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  response.cookies.set(participantCookieName(publicId), deviceToken, participantCookieOptions());
  return response;
}
