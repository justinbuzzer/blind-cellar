import { NextRequest, NextResponse } from "next/server";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/routeHandlerClient";
import { loadProfileData } from "@/lib/supabase/profileData";
import {
  computeAtAGlance,
  computeBlindPalate,
  computeRecentEvenings,
  computeWineRecord,
  DEFAULT_TASTING_SCOPE,
  extractBlindObservations,
  isValidTastingScope,
  modesForScope,
} from "@/lib/profile";

/**
 * The Palate Profile summary (see README "Palate Profile") — At a glance,
 * Blind palate, Your wine record, and Recent evenings. Authenticated-only:
 * every record comes from loadProfileData, which is itself scoped entirely
 * by the caller's own account_tasting_records via RLS. The `scope` query
 * parameter only ever selects between two fixed, server-validated modes —
 * never a client-provided user id, session id, or role. Blind palate is
 * always built from a separately-filtered blind-only observation set,
 * independent of `scope` (see README "Core scope rule").
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseRouteHandlerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase isn't configured. See SUPABASE_SETUP.md." },
      { status: 500 }
    );
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Sign in to view your palate profile." }, { status: 401 });
  }

  const scopeParam = request.nextUrl.searchParams.get("scope");
  const scope = isValidTastingScope(scopeParam) ? scopeParam : DEFAULT_TASTING_SCOPE;

  const { sessionLinks, sessionMetaById, observations } = await loadProfileData(supabase);

  const scopeModes = modesForScope(scope);
  const scopedLinks = sessionLinks.filter((link) => {
    const meta = sessionMetaById.get(link.sessionId);
    return meta !== undefined && scopeModes.includes(meta.tastingMode);
  });
  const scopedMetas = scopedLinks
    .map((link) => sessionMetaById.get(link.sessionId))
    .filter((meta) => meta !== undefined);
  const scopedObservations = observations.filter((o) => scopeModes.includes(o.tastingMode));
  const roleBySessionId = new Map(scopedLinks.map((link) => [link.sessionId, link.role]));

  const blindObservations = extractBlindObservations(observations);

  return NextResponse.json({
    scope,
    atAGlance: computeAtAGlance(scopedMetas, scopedObservations),
    blindPalate: computeBlindPalate(blindObservations),
    wineRecord: computeWineRecord(scopedObservations),
    recentEvenings: computeRecentEvenings(scopedMetas, roleBySessionId),
  });
}
