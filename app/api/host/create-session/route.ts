import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/routeHandlerClient";
import { CreateSessionRpcResult, friendlyRpcError } from "@/lib/supabase/types";
import { generateSessionCode } from "@/lib/codes";
import { generateSecureToken, hashToken } from "@/lib/tokens";
import { isValidTastingMode } from "@/lib/validation";

type AccountLinkStatus = "not_signed_in" | "linked" | "failed";

/**
 * Best-effort automatic account linking for a signed-in host (see README
 * "Account-linked tasting records"). Uses the cookie-aware client only to
 * check who (if anyone) is signed in and to make this one RPC call — the
 * actual tasting-session creation above already completed on the existing
 * anon-key client and is never affected by anything in here. Any failure —
 * not configured, no session, RPC error — is swallowed and reported back as
 * a status the caller can show a subtle non-blocking message for; it never
 * throws and never touches the response already being built.
 */
async function tryAutoLinkHost(publicId: string, hostToken: string): Promise<AccountLinkStatus> {
  try {
    const authedSupabase = getSupabaseRouteHandlerClient();
    if (!authedSupabase) return "not_signed_in";

    const { data: userData } = await authedSupabase.auth.getUser();
    if (!userData.user) return "not_signed_in";

    const { error } = await authedSupabase.rpc("claim_account_tasting_record", {
      p_public_id: publicId,
      p_role: "host",
      p_token: hostToken,
      p_claim_source: "automatic",
    });
    // Best-effort, additive (see README "Session rejoin"): also links the
    // host's OWN participant/guessing guest row to their account, so their
    // personal tasting flow benefits from account-based rejoin too. Never
    // affects host-authorization itself, and its failure is swallowed the
    // same way — it must never change the accountLinkStatus reported above.
    // Awaited (unlike the client-side auto-claim in the old join flow) since
    // this Route Handler fully controls its own lifecycle — an unawaited
    // call here could be silently dropped once the response is sent.
    try {
      await authedSupabase.rpc("link_host_guest_to_account", {
        p_public_id: publicId,
        p_host_token: hostToken,
      });
    } catch {
      // Swallowed — see comment above.
    }
    return error ? "failed" : "linked";
  } catch {
    return "failed";
  }
}

interface CreateSessionBody {
  title: string;
  date: string;
  hostDisplayName: string;
  tastingMode: string;
  /** Betting sub-mode only, course_reveal-only — see README "Tasting modes" — "Betting". */
  bettingEnabled?: boolean;
  /** Required when bettingEnabled — the host is also a guest/bettor via their own guests row. */
  startingCredits?: number;
  /** Per-field decimal odds, all required when bettingEnabled — see README "Tasting modes" — "Betting". */
  countryBetMultiplier?: number;
  regionBetMultiplier?: number;
  appellationBetMultiplier?: number;
  grapeBlendBetMultiplier?: number;
  vintageBetMultiplier?: number;
  producerBetMultiplier?: number;
  wineCuveeBetMultiplier?: number;
}

const MAX_JOIN_CODE_ATTEMPTS = 8;

/** A valid odds multiplier is a finite number > 1 and <= 10 — see tasting_sessions_bet_multipliers_range. */
function parseMultiplier(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 1 && value <= 10 ? value : null;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see SUPABASE_SETUP.md).",
      },
      { status: 500 }
    );
  }

  let body: CreateSessionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const date = typeof body.date === "string" ? body.date : "";
  const hostDisplayName =
    typeof body.hostDisplayName === "string" ? body.hostDisplayName.trim() : "";
  const tastingModeRaw = typeof body.tastingMode === "string" ? body.tastingMode : "";

  if (!title) {
    return NextResponse.json({ error: "A tasting title is required." }, { status: 400 });
  }
  if (!date) {
    return NextResponse.json({ error: "A tasting date is required." }, { status: 400 });
  }
  if (!hostDisplayName) {
    return NextResponse.json({ error: "Enter a display name to host with." }, { status: 400 });
  }
  if (hostDisplayName.length > 60) {
    return NextResponse.json(
      { error: "That name is too long — please shorten it." },
      { status: 400 }
    );
  }
  if (!isValidTastingMode(tastingModeRaw)) {
    return NextResponse.json({ error: "Choose a tasting format." }, { status: 400 });
  }
  const tastingMode = tastingModeRaw;

  // Betting is a course_reveal-only sub-mode (see README "Tasting modes" —
  // "Betting") — mirrors the RPC's own invalid_betting_mode check so a bad
  // request from a tampered client fails with the same clear error.
  const bettingEnabled = body.bettingEnabled === true;
  if (bettingEnabled && tastingMode !== "course_reveal") {
    return NextResponse.json(
      { error: "Betting is only available for Course-by-course reveal tastings." },
      { status: 400 }
    );
  }
  // The host is also a guest/bettor via their own guests row — same
  // starting-balance requirement as anyone who joins via /api/join/create.
  const startingCredits =
    bettingEnabled && typeof body.startingCredits === "number" && Number.isFinite(body.startingCredits)
      ? Math.trunc(body.startingCredits)
      : null;

  // Per-field betting odds — all seven required up front when betting is
  // enabled (see README "Tasting modes" — "Betting"); mirrors the RPC's own
  // invalid_bet_multiplier check so a bad request fails with the same clear
  // error instead of a raw constraint violation.
  const multipliers = {
    countryBetMultiplier: parseMultiplier(body.countryBetMultiplier),
    regionBetMultiplier: parseMultiplier(body.regionBetMultiplier),
    appellationBetMultiplier: parseMultiplier(body.appellationBetMultiplier),
    grapeBlendBetMultiplier: parseMultiplier(body.grapeBlendBetMultiplier),
    vintageBetMultiplier: parseMultiplier(body.vintageBetMultiplier),
    producerBetMultiplier: parseMultiplier(body.producerBetMultiplier),
    wineCuveeBetMultiplier: parseMultiplier(body.wineCuveeBetMultiplier),
  };
  if (bettingEnabled && Object.values(multipliers).some((m) => m === null)) {
    return NextResponse.json(
      { error: "Every betting odds value must be greater than 1 and at most 10." },
      { status: 400 }
    );
  }

  const hostToken = generateSecureToken();
  const hostTokenHash = hashToken(hostToken);

  let lastError: { message?: string; code?: string } | null = null;

  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
    const joinCode = generateSessionCode();

    const { data, error } = await supabase.rpc("create_tasting_session", {
      p_title: title,
      p_tasting_date: date,
      p_join_code: joinCode,
      p_host_token_hash: hostTokenHash,
      p_host_display_name: hostDisplayName,
      p_tasting_mode: tastingMode,
      p_betting_enabled: bettingEnabled,
      p_starting_credits: startingCredits,
      p_country_bet_multiplier: bettingEnabled ? multipliers.countryBetMultiplier : null,
      p_region_bet_multiplier: bettingEnabled ? multipliers.regionBetMultiplier : null,
      p_appellation_bet_multiplier: bettingEnabled ? multipliers.appellationBetMultiplier : null,
      p_grape_blend_bet_multiplier: bettingEnabled ? multipliers.grapeBlendBetMultiplier : null,
      p_vintage_bet_multiplier: bettingEnabled ? multipliers.vintageBetMultiplier : null,
      p_producer_bet_multiplier: bettingEnabled ? multipliers.producerBetMultiplier : null,
      p_wine_cuvee_bet_multiplier: bettingEnabled ? multipliers.wineCuveeBetMultiplier : null,
    });

    if (!error && data) {
      const row = (Array.isArray(data) ? data[0] : data) as CreateSessionRpcResult;
      const accountLinkStatus = await tryAutoLinkHost(row.public_id, hostToken);
      return NextResponse.json({
        publicId: row.public_id,
        joinCode: row.join_code,
        hostToken,
        hostGuestToken: row.host_guest_token,
        accountLinkStatus,
      });
    }

    lastError = error;
    if (error?.code !== "23505") {
      break;
    }
    // 23505 = unique_violation, almost certainly the join_code collision — retry with a new code.
  }

  return NextResponse.json({ error: friendlyRpcError(lastError) }, { status: 500 });
}
