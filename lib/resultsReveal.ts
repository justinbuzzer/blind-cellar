import {
  GuestSubmission,
  ScoredGuess,
  ScoringVersion,
  SessionStatus,
  TastingMode,
  TastingSession,
  TasterResult,
  WineAnswerKey,
  WineGuess,
  WineResult,
} from "@/types/tasting";
import { scoreWineGuess } from "./scoring";
import { calculateTasterResults, calculateWineResults } from "./results";
import { round1 } from "./math";
import { BettableField, FieldBets } from "./betting";
import {
  buildCourseRevealSubmissions,
  buildRevealedSubmissions,
} from "./supabase/mappers";
import {
  BottleResultForHostResponse,
  BottleResultGuessDTO,
  FinalLeaderboardResponse,
  LeaderboardGuessDTO,
  LeaderboardWineDTO,
  ProvisionalLeaderboardResponse,
  RevealedWineGuessRow,
} from "./supabase/types";

/**
 * Per-bottle results view — see get_bottle_result_for_host/
 * get_bottle_result_for_guest in supabase/schema.sql and README "Results
 * reveal". Shared by the host per-bottle result page and (course_reveal
 * only) the participant reveal screen, since both RPCs return the identical
 * `participants` shape. Scores every eligible participant's guess with the
 * exact same `scoreWineGuess` the final report and the participant's own
 * "Your score" section use, so no scoring rule is ever duplicated here.
 */
export interface BottleParticipantScore {
  guestName: string;
  submitted: boolean;
  /** Null exactly when submitted is false — never a fabricated zero score. */
  score: ScoredGuess | null;
  /**
   * Betting sub-mode only (see README "Tasting modes" — "Betting") — the
   * amount this participant wagered on each field, keyed the same way
   * FieldScore.field is. Empty for a non-betting session, or when
   * `submitted` is false — never a fabricated bet.
   */
  bets: FieldBets;
}

export interface BottleResultAggregate {
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

export interface BottleResultView {
  wine: WineAnswerKey;
  scoringVersion: ScoringVersion;
  participants: BottleParticipantScore[];
  aggregate: BottleResultAggregate;
  /**
   * Betting sub-mode only (see README "Tasting modes" — "Betting") — this
   * session's per-field decimal odds, so a Bet column can show the payout
   * ratio (e.g. "10 cr @ 1.3x") alongside each wager. Empty for a
   * non-betting session.
   */
  multipliers: Partial<Record<BettableField, number>>;
}

/** Betting sub-mode only — see BottleParticipantScore.bets above. */
function mapBottleGuessDtoToFieldBets(dto: BottleResultGuessDTO): FieldBets {
  return {
    country: dto.countryBet ?? undefined,
    region: dto.regionBet ?? undefined,
    appellation: dto.appellationBet ?? undefined,
    grapeBlend: dto.grapeBlendBet ?? undefined,
    vintage: dto.vintageBet ?? undefined,
    producer: dto.producerBet ?? undefined,
    wineName: dto.wineCuveeBet ?? undefined,
  };
}

function mapBottleGuessDtoToWineGuess(wineId: string, dto: BottleResultGuessDTO): WineGuess {
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
  };
}

export function buildBottleResultView(response: BottleResultForHostResponse): BottleResultView {
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
    photoPath: response.wine.photoPath ?? undefined,
  };

  const participants: BottleParticipantScore[] = response.participants.map((p) => ({
    guestName: p.guestName,
    submitted: p.submitted,
    score:
      p.submitted && p.guess
        ? scoreWineGuess(
            p.guestName,
            p.guestName,
            mapBottleGuessDtoToWineGuess(response.wine.id, p.guess),
            wine,
            response.session.scoringVersion
          )
        : null,
    bets: p.submitted && p.guess ? mapBottleGuessDtoToFieldBets(p.guess) : {},
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
    multipliers: {
      country: response.session.countryBetMultiplier ?? undefined,
      region: response.session.regionBetMultiplier ?? undefined,
      appellation: response.session.appellationBetMultiplier ?? undefined,
      grapeBlend: response.session.grapeBlendBetMultiplier ?? undefined,
      vintage: response.session.vintageBetMultiplier ?? undefined,
      producer: response.session.producerBetMultiplier ?? undefined,
      wineName: response.session.wineCuveeBetMultiplier ?? undefined,
    },
  };
}

/** "No submitted guesses to score yet." per README "Results reveal" — the exact required empty-state copy. */
export function formatBottleAggregateSummary(aggregate: BottleResultAggregate): string {
  if (aggregate.submittedCount === 0 || aggregate.averageScore === null || aggregate.totalPossiblePoints === null) {
    return "No submitted guesses to score yet.";
  }
  return `Average score: ${aggregate.averageScore} / ${aggregate.totalPossiblePoints}`;
}

// --- Shared ranking pipeline (provisional host leaderboard + final leaderboard/recap) ---

/**
 * The one shape `get_provisional_leaderboard_for_host` and
 * `get_final_leaderboard_for_guest` both return (see supabase/schema.sql) —
 * every currently-in-scope wine's answer key plus every counted guess for
 * those wines, and every guest row. `buildRankedResults` below is the single
 * place that turns this raw, server-authorized shape into ranked results, so
 * the host-provisional and participant-final leaderboards can never compute
 * a rank two different ways.
 */
interface RankedResultsSource {
  wines: LeaderboardWineDTO[];
  guesses: LeaderboardGuessDTO[];
  guests: { id: string; displayName: string; completedAt: string | null }[];
  tastingMode: TastingMode;
  scoringVersion: ScoringVersion;
  sessionStatus: SessionStatus;
}

interface RankedResults {
  tasterResults: TasterResult[];
  wineResults: WineResult[];
}

/**
 * Builds a synthetic `TastingSession` scoped to just the wines in `source`,
 * then calls the exact same `buildRevealedSubmissions`/
 * `buildCourseRevealSubmissions` + `calculateTasterResults`/
 * `calculateWineResults` pipeline the final `/results` report already uses
 * (see lib/supabase/mappers.ts, lib/results.ts) — no ranking or per-bottle
 * scoring math is ever duplicated here, only the data scoping changes.
 * Shared by `buildProvisionalLeaderboard` (host, revealed-bottles-only) and
 * `buildFinalLeaderboardView` (participant, only ever called once every
 * bottle is revealed) so the two can never quietly compute a rank
 * differently.
 *
 * Ties are broken using calculateTasterResults's own existing tie-break key
 * sequence (percentage, then raw points, then submitted-guess count, then
 * exact core matches — see lib/results.ts); any true remaining tie falls
 * back to alphabetical display-name order, achieved by pre-sorting the
 * submissions alphabetically before ranking and relying on Array.sort's
 * guaranteed stability. This repository's canonical ranking has no notion of
 * "more perfect-score bottles" as a tie-break key, so that key is
 * deliberately not invented here — see README "Final leaderboard and
 * tasting recap".
 */
function buildRankedResults(source: RankedResultsSource): RankedResults {
  const wines: WineAnswerKey[] = source.wines.map((w) => ({
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
    photoPath: w.photoPath ?? undefined,
  }));

  const guessRows: RevealedWineGuessRow[] = source.guesses.map((g) => ({
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
    tasting_note: null,
    submitted_at: "",
    locked_at: g.lockedAt,
  }));

  const guestSummaries = source.guests.map((g) => ({ id: g.id, displayName: g.displayName }));
  const submissions: GuestSubmission[] =
    source.tastingMode === "course_reveal"
      ? buildCourseRevealSubmissions(guessRows, guestSummaries)
      : buildRevealedSubmissions(
          guessRows,
          source.guests.filter((g) => g.completedAt !== null).map((g) => ({ id: g.id, displayName: g.displayName }))
        );

  const alphabeticalSubmissions = [...submissions].sort((a, b) => a.guestName.localeCompare(b.guestName));

  const session: TastingSession = {
    id: "",
    code: "",
    title: "",
    date: "",
    wines,
    status: source.sessionStatus,
    createdAt: "",
    scoringVersion: source.scoringVersion,
  };

  return {
    tasterResults: calculateTasterResults(session, alphabeticalSubmissions),
    wineResults: calculateWineResults(session, alphabeticalSubmissions),
  };
}

// --- Provisional leaderboard (host-only, revealed bottles only) ---

export interface ProvisionalLeaderboardView {
  tasterResults: TasterResult[];
  wineResults: WineResult[];
  scoringVersion: ScoringVersion;
  allRevealed: boolean;
  revealedCount: number;
  totalCount: number;
}

/**
 * Builds the host's provisional leaderboard — see `buildRankedResults`
 * above for the shared ranking pipeline. Never used for Seen tastings,
 * which have no scoring/leaderboard model at all.
 */
export function buildProvisionalLeaderboard(
  response: ProvisionalLeaderboardResponse
): ProvisionalLeaderboardView {
  const { tasterResults, wineResults } = buildRankedResults(response);

  return {
    tasterResults,
    wineResults,
    scoringVersion: response.scoringVersion,
    allRevealed: response.totalCount > 0 && response.revealedCount === response.totalCount,
    revealedCount: response.revealedCount,
    totalCount: response.totalCount,
  };
}

// --- Final leaderboard + tasting recap (participant, only once fully revealed) ---

export interface FinalLeaderboardView {
  tasterResults: TasterResult[];
  wineResults: WineResult[];
  /** The viewer's own guest id — for "(you)" row-marking and picking out their own per-bottle score, never anyone else's. */
  myGuestId: string;
  title: string;
  tastingDate: string;
  tastingMode: TastingMode;
  scoringVersion: ScoringVersion;
  revealedCount: number;
  totalCount: number;
}

/**
 * Builds the participant-facing final leaderboard + tasting recap data —
 * see `buildRankedResults` above for the shared ranking pipeline reused
 * from the host provisional leaderboard. Only ever called with a response
 * from `get_final_leaderboard_for_guest`, which itself only ever returns
 * data once the whole session has reached `revealed` — this function does
 * no additional eligibility gating of its own.
 */
export function buildFinalLeaderboardView(response: FinalLeaderboardResponse): FinalLeaderboardView {
  const { tasterResults, wineResults } = buildRankedResults(response);

  return {
    tasterResults,
    wineResults,
    myGuestId: response.myGuestId,
    title: response.title,
    tastingDate: response.tastingDate,
    tastingMode: response.tastingMode,
    scoringVersion: response.scoringVersion,
    revealedCount: response.revealedCount,
    totalCount: response.totalCount,
  };
}

/** This app's one existing "(you)" row-marking convention (see HostControlClient's participant list) — reused verbatim rather than inventing a second style. */
export function withYouSuffix(displayName: string, isYou: boolean): string {
  return isYou ? `${displayName} (you)` : displayName;
}

/** `taster.overallAccuracyPercent`, formatted to this app's one existing leaderboard-percentage convention (see TasterLeaderboard) — one decimal place, e.g. "84.0%". */
export function formatLeaderboardPercent(overallAccuracyPercent: number): string {
  return `${overallAccuracyPercent.toFixed(1)}%`;
}

/** This taster's own row, or undefined if they have no counted score for this scope (see README "Final leaderboard and tasting recap" — never fabricated). */
export function findMyTasterResult(tasterResults: TasterResult[], myGuestId: string): TasterResult | undefined {
  return tasterResults.find((t) => t.guestId === myGuestId);
}

/** One guest's own scored guess for one bottle, or undefined if they have no counted guess for it — never another guest's. */
export function findGuessByGuestId(wineResult: WineResult, guestId: string): ScoredGuess | undefined {
  return wineResult.guesses.find((g) => g.guestId === guestId);
}

// --- Host recap: per-bottle aggregate overview ---

export interface HostRecapBottleSummary {
  wine: WineAnswerKey;
  submittedCount: number;
  /** Arithmetic mean of each counted guess's own normalized `overallAccuracyPercent` — never a raw-points average across guesses (see README "Final leaderboard and tasting recap" — "Bottle average"). Null when submittedCount is 0. */
  averagePercent: number | null;
  /** Native-form (this bottle's own denominator — every guess for one bottle already shares it) highest score. Null when submittedCount is 0. */
  highestScore: { earned: number; possible: number } | null;
}

/** Builds the host recap's per-bottle aggregate overview directly from the same `wineResults` the provisional leaderboard already computed — no second data fetch, no duplicated scoring. */
export function buildHostRecapBottleSummaries(wineResults: WineResult[]): HostRecapBottleSummary[] {
  return wineResults.map((wr) => {
    const guesses = wr.guesses;
    if (guesses.length === 0) {
      return { wine: wr.wine, submittedCount: 0, averagePercent: null, highestScore: null };
    }
    const averagePercent = round1(
      guesses.reduce((sum, g) => sum + g.overallAccuracyPercent, 0) / guesses.length
    );
    const highest = guesses.reduce((max, g) => (g.totalPoints > max.totalPoints ? g : max), guesses[0]);
    return {
      wine: wr.wine,
      submittedCount: guesses.length,
      averagePercent,
      highestScore: { earned: highest.totalPoints, possible: highest.totalPossiblePoints },
    };
  });
}

/** "No submitted guesses to score." per README "Final leaderboard and tasting recap" — the exact required host-recap empty-state copy (distinct from the per-bottle result page's own "...yet." wording, which is unchanged). */
export function formatHostRecapBottleLine(summary: HostRecapBottleSummary): string {
  if (summary.submittedCount === 0 || summary.averagePercent === null || summary.highestScore === null) {
    return "No submitted guesses to score.";
  }
  return `${summary.submittedCount} submitted · Average ${summary.averagePercent}% · Highest ${summary.highestScore.earned} / ${summary.highestScore.possible}`;
}

// --- Host leaderboard: per-participant per-bottle detail ---

export interface ParticipantBottleTotal {
  /** The bottle's safe anonymous code (e.g. "Bottle 3") — never a raw id. */
  code: string;
  /** Null when this participant has no counted guess for this bottle. */
  guess: ScoredGuess | null;
}

/** One participant's own per-bottle totals across every wine in `wineResults`, in tasting order — used by the host leaderboard's expandable per-participant detail. Never another participant's guess. */
export function buildParticipantBottleTotals(
  wineResults: WineResult[],
  guestId: string
): ParticipantBottleTotal[] {
  return wineResults.map((wr) => ({
    code: wr.wine.code,
    guess: findGuessByGuestId(wr, guestId) ?? null,
  }));
}
