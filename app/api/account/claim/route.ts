import { NextRequest, NextResponse } from "next/server";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/routeHandlerClient";
import { parseClaimRequest } from "@/lib/archive";

/**
 * The single, generic-on-failure message for every way this can fail —
 * missing auth, malformed request, invalid/stale token, wrong session,
 * not-yet-revealed session, or an already-linked record. See README
 * "Account-linked tasting records": never reveal which one occurred, and
 * never confirm or deny that a session exists to a caller who doesn't
 * already hold a valid credential for it.
 */
const GENERIC_ERROR =
  "This tasting could not be added to your record. Your existing access has not changed.";

/**
 * Links the signed-in caller's account to a session in a specific role —
 * used both for the explicit "Add to my tasting record" historic claim and
 * for automatic linking right after a signed-in host creates or participant
 * joins a session (see app/api/host/create-session and
 * app/join/[publicId]/page.tsx). All real authorization happens inside
 * claim_account_tasting_record itself (SECURITY DEFINER, re-validates the
 * host/guest token against the exact session, gates revealed-status for
 * historic claims) — this route is a thin, generic-error-only wrapper, the
 * same shape as every other Route Handler in this app.
 */
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const claim = parseClaimRequest(body);
  if (!claim) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const { error } = await supabase.rpc("claim_account_tasting_record", {
    p_public_id: claim.publicId,
    p_role: claim.role,
    p_token: claim.token,
    p_claim_source: claim.claimSource,
  });

  if (error) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  return NextResponse.json({ status: "linked" });
}
