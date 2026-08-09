import {
  GuestSubmission,
  ScoredGuess,
  ScoringVersion,
  TastingSession,
  TasterResult,
  WineAnswerKey,
  WineGuess,
} from "@/types/tasting";
import { scoreWineGuess } from "./scoring";
import { calculateTasterResults } from "./results";
import { round1 } from "./math";
import {
  buildCourseRevealSubmissions,
  buildRevealedSubmissions,
} from "./supabase/mappers";
import {
  BottleResultForHostResponse,
  HostBottleGuessDTO,
  ProvisionalLeaderboardResponse,
  RevealedWineGuessRow,
} from "./supabase/types";

/**
 * Host-only per-bottle results view — see get_bottle_result_for_host in
 * supabase/schema.sql and README "Results reveal". Scores every eligible
 * participant's guess with the exact same `scoreWineGuess` the final report
 * and the participant's own reveal page use, so no scoring rule is ever
 * duplicated for the host view.
 */
export interface HostBottleParticipantScore {
  guestName: string;
  submitted: boolean;
  /** Null exactly when submitted is false — never a fabricated zero score. */
  score: ScoredGuess | null;
}

export interface HostBottleAggregate {
  eligibleCount: number;
  submittedCount: number;
  /** Null when submittedCount is 0 — there is nothing to average. */
  averageScore: number | null;
  highestScore: number | null;
  /**
   * This bottle's own possible-points denominator (80 or 100 under
   * core_v3_appellation_conditional, always 120 under legacy_v1) — every
   * participant scored against the same wine shares one denominator, so
   * there is no mixed-denominator ambiguity at the single-bottle level (see
   * README "Results reveal"). Null when submittedCount is 0.
   */
  totalPossiblePoints: number | null;
  perfectScoreCount: number;
}

export interface HostBottleResultView {
  wine: WineAnswerKey;
  scoringVersion: ScoringVersion;
  participants: HostBottleParticipantScore[];
  aggregate: HostBottleAggregate;
}

function mapHostGuessDtoToWineGuess(wineId: string, dto: HostBottleGuessDTO): WineGuess {
  return {
    wineId,
    country: dto.countryGuess,
    region: dto.regionGuess,
    appellation: dto.appellationGuess ?? "",
    grapeBlendMode: dto.grapeBlendMode ?? "",
    grapeBlend: dto.grapeBlendGuess,
    selectedGrapes: [],
    otherGrapesText: "",
    producer: dto.producerGuess,
    wineName: dto.wineCuveeGuess,
    vintage: dto.vintageGuess,
    rating: dto.rating,
    confidence: dto.confidence,
  };
}

export function buildHostBottleResult(response: BottleResultForHostResponse): HostBottleResultView {
  const wine: WineAnswerKey = {
    id: response.wine.id,
    code: response.wine.anonymousCode,
    country: response.wine.country,
    region: response.wine.region,
    appellation: response.wine.appellation ?? undefined,
    grapeBlendMode: response.wine.grapeBlendMode ?? "",
    grapeBlend: response.wine.grapeBlend,
    producer: response.wine.producer,
    wineName: response.wine.wineCuvee,
    vintage: response.wine.vintage,
    wineStyle: response.wine.wineStyle,
    tastingOrder: response.wine.position,
    contributorName: response.wine.contributorName ?? undefined,
  };

  const participants: HostBottleParticipantScore[] = response.participants.map((p) => ({
    guestName: p.guestName,
    submitted: p.submitted,
    score:
      p.submitted && p.guess
        ? scoreWineGuess(
            p.guestName,
            p.guestName,
            mapHostGuessDtoToWineGuess(response.wine.id, p.guess),
            wine,
            response.session.scoringVersion
          )
        : null,
  }));

  const scores = participants.map((p) => p.score).filter((s): s is ScoredGuess => s !== null);
  const submittedCount = participants.filter((p) => p.submitted).length;
  const totalPossiblePoints = scores[0]?.totalPossiblePoints ?? null;
  const averageScore =
    scores.length === 0
      ? null
      : round1(scores.reduce((sum, s) => sum + s.totalPoints, 0) / scores.length);
  const highestScore = scores.length === 0 ? null : Math.max(...scores.map((s) => s.totalPoints));
  const perfectScoreCount = scores.filter((s) => s.totalPoints === s.totalPossiblePoints).length;

  return {
    wine,
    scoringVersion: response.session.scoringVersion,
    participants,
    aggregate: {
      eligibleCount: participants.length,
      submittedCount,
      averageScore,
      highestScore,
      totalPossiblePoints,
      perfectScoreCount,
    },
  };
}

/** "No submitted guesses to score yet." per README "Results reveal" — the exact required empty-state copy. */
export function formatBottleAggregateSummary(aggregate: HostBottleAggregate): string {
  if (aggregate.submittedCount === 0 || aggregate.averageScore === null || aggregate.totalPossiblePoints === null) {
    return "No submitted guesses to score yet.";
  }
  return `Average score: ${aggregate.averageScore} / ${aggregate.totalPossiblePoints}`;
}

// --- Provisional leaderboard (host-only, revealed bottles only) ---

export interface ProvisionalLeaderboardView {
  tasterResults: TasterResult[];
  scoringVersion: ScoringVersion;
  allRevealed: boolean;
  revealedCount: number;
  totalCount: number;
}

/**
 * Builds the host's provisional leaderboard by constructing a synthetic
 * `TastingSession` scoped to only the currently-revealed wines, then calling
 * the exact same `buildRevealedSubmissions`/`buildCourseRevealSubmissions` +
 * `calculateTasterResults` pipeline the final /results page already uses
 * (see lib/supabase/mappers.ts, lib/results.ts) — no ranking/scoring math is
 * duplicated here, only the data scoping changes. Never used for Seen
 * tastings, which have no scoring/leaderboard model at all.
 *
 * Ties are broken using calculateTasterResults's own existing tie-break key
 * sequence (percentage, then raw points, then submitted-guess count, then
 * exact core matches — see lib/results.ts); any true remaining tie falls
 * back to alphabetical display-name order, achieved by pre-sorting the
 * submissions alphabetically before ranking and relying on Array.sort's
 * guaranteed stability.
 */
export function buildProvisionalLeaderboard(
  response: ProvisionalLeaderboardResponse
): ProvisionalLeaderboardView {
  const wines: WineAnswerKey[] = response.wines.map((w) => ({
    id: w.id,
    code: w.anonymousCode,
    country: w.country,
    region: w.region,
    appellation: w.appellation ?? undefined,
    grapeBlendMode: w.grapeBlendMode ?? "",
    grapeBlend: w.grapeBlend,
    producer: w.producer,
    wineName: w.wineCuvee,
    vintage: w.vintage,
    wineStyle: w.wineStyle,
    tastingOrder: w.tastingOrder,
  }));

  const guessRows: RevealedWineGuessRow[] = response.guesses.map((g) => ({
    id: "",
    session_id: "",
    wine_id: g.wineId,
    guest_id: g.guestId,
    country_guess: g.countryGuess,
    region_guess: g.regionGuess,
    appellation_guess: g.appellationGuess,
    grape_style_guess: g.grapeBlendGuess,
    grape_blend_mode: g.grapeBlendMode,
    producer_guess: g.producerGuess,
    wine_cuvee_guess: g.wineCuveeGuess,
    vintage_guess: g.vintageGuess,
    rating: g.rating,
    confidence: g.confidence,
    tasting_note: null,
    submitted_at: "",
    locked_at: g.lockedAt,
  }));

  const guestSummaries = response.guests.map((g) => ({ id: g.id, displayName: g.displayName }));
  const submissions: GuestSubmission[] =
    response.tastingMode === "course_reveal"
      ? buildCourseRevealSubmissions(guessRows, guestSummaries)
      : buildRevealedSubmissions(
          guessRows,
          response.guests.filter((g) => g.completedAt !== null).map((g) => ({ id: g.id, displayName: g.displayName }))
        );

  const alphabeticalSubmissions = [...submissions].sort((a, b) => a.guestName.localeCompare(b.guestName));

  const session: TastingSession = {
    id: "",
    code: "",
    title: "",
    date: "",
    wines,
    status: response.sessionStatus,
    createdAt: "",
    scoringVersion: response.scoringVersion,
  };

  return {
    tasterResults: calculateTasterResults(session, alphabeticalSubmissions),
    scoringVersion: response.scoringVersion,
    allRevealed: response.totalCount > 0 && response.revealedCount === response.totalCount,
    revealedCount: response.revealedCount,
    totalCount: response.totalCount,
  };
}
