import { SupabaseClient } from "@supabase/supabase-js";
import { SeenTastingReport, TastingMode, TastingReport, TastingSession } from "@/types/tasting";
import { buildSeenTastingReport, SeenRatingRow } from "@/lib/seenResults";
import { buildTastingReport } from "@/lib/results";
import {
  buildCourseRevealSubmissions,
  buildRevealedSubmissions,
  mapRevealedWineRowToAnswerKey,
} from "./mappers";

/** The minimal session shape this loader needs — deliberately narrower than SessionRow so callers (results page, archive lookup) can supply it from whichever RPC/query they already have on hand. */
export interface ReportSessionRef {
  id: string;
  tastingMode: TastingMode;
}

export type ReportData =
  | { kind: "seen"; report: SeenTastingReport }
  | { kind: "standard"; report: TastingReport };

/**
 * Fetches every revealed-only row a final report needs and builds it via the
 * existing calculation engine (buildTastingReport / buildSeenTastingReport) —
 * never re-implemented. Extracted from app/results/[publicId]/page.tsx so the
 * Tasting Archive's lookup route can reuse the exact same pipeline instead of
 * duplicating it (see README "Tasting archive"). Assumes the caller has
 * already confirmed the session is `revealed` and the viewer is authorized to
 * see it — this function itself does no authorization, matching the
 * pre-existing behaviour of the data it reads (guest_visible_wines /
 * revealed_wine_guesses are anon-readable once revealed, gated by the views'
 * own status check, not by a token).
 */
export async function loadTastingReportData(
  supabase: SupabaseClient,
  session: ReportSessionRef
): Promise<ReportData> {
  const [{ data: wineRows }, { data: guestRows }, { data: guessRows }] = await Promise.all([
    supabase
      .from("guest_visible_wines")
      .select("*")
      .eq("session_id", session.id)
      .order("bottle_number", { ascending: true }),
    supabase.from("guests").select("id, display_name, completed_at").eq("session_id", session.id),
    supabase.from("revealed_wine_guesses").select("*").eq("session_id", session.id),
  ]);

  const guestNameById = new Map((guestRows ?? []).map((g) => [g.id, g.display_name]));

  const wines = (wineRows ?? []).map((row) => ({
    ...mapRevealedWineRowToAnswerKey(row),
    contributorName: row.contributor_guest_id
      ? guestNameById.get(row.contributor_guest_id)
      : undefined,
  }));

  if (session.tastingMode === "seen") {
    const ratingRows: SeenRatingRow[] = (guessRows ?? []).map((row) => ({
      wineId: row.wine_id,
      guestId: row.guest_id,
      rating: row.rating,
      note: row.tasting_note ?? undefined,
    }));
    const guests = (guestRows ?? []).map((g) => ({ id: g.id, displayName: g.display_name }));
    return { kind: "seen", report: buildSeenTastingReport(wines, guests, ratingRows) };
  }

  const domainSession: TastingSession = {
    id: session.id,
    code: "",
    title: "",
    date: "",
    status: "revealed",
    createdAt: "",
    wines,
  };

  const submissions =
    session.tastingMode === "course_reveal"
      ? buildCourseRevealSubmissions(
          guessRows ?? [],
          (guestRows ?? []).map((g) => ({ id: g.id, displayName: g.display_name }))
        )
      : buildRevealedSubmissions(
          guessRows ?? [],
          (guestRows ?? [])
            .filter((g) => g.completed_at !== null)
            .map((g) => ({ id: g.id, displayName: g.display_name }))
        );

  return { kind: "standard", report: buildTastingReport(domainSession, submissions) };
}
