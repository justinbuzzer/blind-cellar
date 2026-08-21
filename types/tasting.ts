// Core data model for a single local Blind Cellar tasting session.
// Everything here is plain, serialisable data so it can be persisted to
// localStorage as JSON without any transformation.

/**
 * How a wine's grape/blend answer (or a guess) was captured:
 * - "single": one variety chosen from the curated dropdown.
 * - "blend": free-text description of multiple grapes.
 * - "" (empty string): unknown — either a legacy row from before this field
 *   existed, or (for a guess) not yet chosen. Scoring treats "" specially;
 *   see `lib/scoring.ts`.
 */
export type GrapeBlendMode = "single" | "blend";

export const GRAPE_BLEND_MODES: GrapeBlendMode[] = ["single", "blend"];

/** Contributor-classified wine style. Required for every bottle; not a scored/guessed field. */
export type WineStyle = "bubbles" | "white" | "red" | "sweet" | "other";

export const WINE_STYLES: WineStyle[] = ["bubbles", "white", "red", "sweet", "other"];

export const WINE_STYLE_LABELS: Record<WineStyle, string> = {
  bubbles: "Bubbles",
  white: "White",
  red: "Red",
  sweet: "Sweet",
  other: "Other",
};

/**
 * The coarser style grouping used for contributor bottle labels (see README
 * "Bottle labels") — "Ava — Red #1". Distinct from WineStyle/WINE_STYLE_LABELS
 * above: sweet and other both collapse into "other" here (display "Other"),
 * since this app has never distinguished them from each other in any
 * participant-facing copy, and a contributor label groups/sequences bottles
 * by this same bucket, not by the raw five-value WineStyle.
 */
export type ContributorStyleBucket = "red" | "white" | "bubbles" | "other";

export const CONTRIBUTOR_STYLE_BUCKET_LABELS: Record<ContributorStyleBucket, string> = {
  red: "Red",
  white: "White",
  bubbles: "Bubbles",
  other: "Other",
};

/**
 * The wine-identity fields shared, unchanged, by both the tasting bottle
 * form and the Personal Cellar bottle form (see README "Personal Cellar")
 * — kept as one shape so the two can never drift into divergent field sets
 * or validation. `BottleFormInput`/`CellarBottleFormInput` each extend this
 * with their own additional fields (a private per-tasting note vs. bottle
 * format/storage/personal note).
 */
export interface WineIdentityInput {
  country: string;
  region: string;
  /**
   * Optional, conditional on country+region (see lib/appellations.ts) — a
   * more specific recognised appellation within `region`, e.g. Chablis
   * within Burgundy. Always "" when the selected country/region pair has no
   * curated appellation list, or when the contributor leaves it blank.
   */
  appellation: string;
  /** "" until the contributor picks single/blend for this bottle. */
  grapeBlendMode: GrapeBlendMode | "";
  grapeBlend: string;
  /** Blend mode only: grapes picked from the curated list. Empty/unused in single mode. */
  selectedGrapes: string[];
  /** Blend mode only: raw free text for varieties not on the curated list. Empty/unused in single mode. */
  otherGrapesText: string;
  /**
   * Single mode only: true when "Other grape" is the selected dropdown
   * option (see GrapeBlendField) — client/UI state only, never persisted.
   * The actual typed grape name still lives in `grapeBlend`; this only
   * distinguishes "blank because untouched" from "blank because Other grape
   * was chosen but no text was entered yet" for validation/display purposes.
   * Optional so every pre-existing WineIdentityInput literal in the codebase
   * stays valid untouched; undefined is treated identically to false.
   */
  otherGrapeSelected?: boolean;
  producer: string;
  wineName: string;
  vintage: string;
  wineStyle: WineStyle | "";
}

/**
 * Personal Cellar v1 (see README "Personal Cellar"): a controlled bottle-size
 * vocabulary, aligned with real cellar usage rather than every possible
 * format. "Other" pairs with a short free-text detail field.
 */
export type BottleFormat = "375ml" | "500ml" | "750ml" | "1500ml" | "other";

export const BOTTLE_FORMATS: BottleFormat[] = ["375ml", "500ml", "750ml", "1500ml", "other"];

export const BOTTLE_FORMAT_LABELS: Record<BottleFormat, string> = {
  "375ml": "375ml (half)",
  "500ml": "500ml",
  "750ml": "750ml (standard)",
  "1500ml": "Magnum (1.5L)",
  other: "Other",
};

/**
 * A cellar bottle's lifecycle (see README "Personal Cellar" —
 * "Status lifecycle"): `available` → `reserved` (registered for a tasting,
 * not yet used or returned) → `consumed` (used; permanent, never reverts).
 * `reserved` can also return to `available` if the bottle is removed from
 * the tasting before it begins. Enforced primarily by
 * `cellar_bottles_status_shape` in `supabase/schema.sql`, not just this type.
 */
export type CellarBottleStatus = "available" | "reserved" | "consumed";

export const CELLAR_BOTTLE_STATUSES: CellarBottleStatus[] = ["available", "reserved", "consumed"];

export const CELLAR_STATUS_LABELS: Record<CellarBottleStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  consumed: "Consumed",
};

/** The private answer key for one bottle. Never shown to other participants before reveal. */
export interface WineAnswerKey {
  id: string;
  /** Anonymous label shown to participants, e.g. "Bottle 1". Assigned in order. */
  code: string;
  country: string;
  region: string;
  /** Optional, more specific appellation within `region` — see WineIdentityInput. Undefined for historic bottles predating this field, or when the bottle's country/region pair has no curated list, or when left blank. Never used in scoring. */
  appellation?: string;
  /** How `grapeBlend` was captured. "" means legacy/unknown — see GrapeBlendMode. */
  grapeBlendMode: GrapeBlendMode | "";
  /** Canonical single-variety name, or free-text blend description. */
  grapeBlend: string;
  producer: string;
  wineName: string;
  vintage: string;
  wineStyle: WineStyle;
  /** 1-based serving position, host-arranged during registration and frozen at collecting. Distinct from the bottle's permanent anonymous number. */
  tastingOrder: number;
  hostNotes?: string;
  /** Contributor's display name. Only ever populated after reveal. */
  contributorName?: string;
  /** Contributor's guest id. Only ever populated after reveal — used by the Palate Profile ledger's "Contributed by you" label (see README "Palate Profile"); never inferred from display name. */
  contributorGuestId?: string;
  /** Bucketed style for the contributor bottle label (see README "Bottle labels") — derived client-side from wineStyle via wineStyleToContributorBucket, since this field is only ever populated after reveal, same as wineStyle/contributorName. */
  contributorStyleBucket?: ContributorStyleBucket;
  /** This contributor's stable 1-based ordinal within contributorStyleBucket for this session — see lib/contributorLabel.ts formatContributorBottleLabel. Only ever populated after reveal. */
  contributorStyleSequence?: number;
  /** Object path into the public `bottle-photos` Storage bucket (see README "Bottle photos") — not a URL; pass through lib/photoUrl.ts's tastingBottlePhotoUrl to render it. Undefined when the contributor never uploaded one, or, pre-reveal, always undefined regardless of whether a photo exists (masked the same way as every other identity field). */
  photoPath?: string;
}

/**
 * Which scoring model a session uses — chosen once, immutably, at session
 * creation (see supabase/schema.sql `create_tasting_session`) and never
 * client-controlled or editable afterwards. Historic sessions keep whatever
 * they were created with forever; scoring is never recalculated under a
 * different version. Three versions have ever actually existed:
 * 'legacy_v1' is the country(20)/region(30)/grapeBlend(30)/vintage(20) core
 * (100 max) plus producer(10)/wineName(10) bonus (20 max), 120 max total,
 * every session shipped before the scoring-model replacement. The
 * previously-planned 140-point Appellation-bonus model was never actually
 * deployed (Appellation guesses existed but were always explicitly
 * unscored), so there is no intermediate legacy version to support.
 * 'core_v3_appellation_conditional' is the seven-category, no-bonus-tier
 * model — see CORE_V3_FIELD_POINTS and lib/scoring.ts — every session
 * created between the scoring-model replacement and the partial-credit
 * feature. 'core_v4_partial_credit' is the current model: identical to
 * core_v3_appellation_conditional's shape and point weights, but Vintage,
 * Grape/blend, and Producer/Wine-cuvée guesses that are close-but-not-exact
 * earn partial credit instead of scoring zero (see calculateBlindScoreV4 in
 * lib/scoring.ts) — Country, Region, and Appellation stay exact-match-only,
 * unchanged from core_v3_appellation_conditional.
 */
export type ScoringVersion =
  | "legacy_v1"
  | "core_v3_appellation_conditional"
  | "core_v4_partial_credit";

export const SCORING_VERSIONS: ScoringVersion[] = [
  "legacy_v1",
  "core_v3_appellation_conditional",
  "core_v4_partial_credit",
];

/** Every newly created session is assigned this version, server-side only — never a client-supplied value. See create_tasting_session in supabase/schema.sql. */
export const CURRENT_SCORING_VERSION: ScoringVersion = "core_v4_partial_credit";

export type SessionStatus = "registration" | "collecting" | "revealed";

export const SESSION_STATUSES: SessionStatus[] = [
  "registration",
  "collecting",
  "revealed",
];

/**
 * Chosen once at session creation and never editable afterwards (see README
 * "Tasting modes"). Every session created before this feature existed
 * safely defaults/backfills to "full_blind" — today's only behaviour.
 */
export type TastingMode = "full_blind" | "course_reveal" | "seen" | "blind_match";

export const TASTING_MODES: TastingMode[] = ["full_blind", "course_reveal", "seen", "blind_match"];

export const TASTING_MODE_LABELS: Record<TastingMode, string> = {
  full_blind: "Full blind tasting",
  course_reveal: "Course-by-course reveal",
  seen: "Seen tasting",
  blind_match: "Blind match",
};

export const TASTING_MODE_DESCRIPTIONS: Record<TastingMode, string> = {
  full_blind:
    "All bottles are tasted blind before any wines are revealed. Best for comparative tastings where complete objectivity matters.",
  course_reveal:
    "Each bottle is tasted blind, then revealed before moving to the next. Best for casual dinners and relaxed tasting discussions.",
  seen:
    "All bottles are visible from the start. Best for relaxed tastings where guests want to compare wines openly and rate them at their own pace.",
  blind_match:
    "The full wine list is visible from the start. Match each glass to a wine, score it, and jot notes — revise anytime until the host reveals the answers.",
};

export interface TastingSession {
  id: string;
  /** Short human-readable join code, e.g. "MAROON-42". */
  code: string;
  title: string;
  /** ISO date string (yyyy-mm-dd). */
  date: string;
  wines: WineAnswerKey[];
  status: SessionStatus;
  createdAt: string;
  /** Immutable, assigned at creation — see ScoringVersion. Governs which scoring math lib/scoring.ts and lib/results.ts use for every guess in this session. */
  scoringVersion: ScoringVersion;
}

export interface Guest {
  id: string;
  name: string;
  joinedAt: string;
}

/** One guest's guess for a single wine, keyed by the wine's id. */
export interface WineGuess {
  wineId: string;
  country: string;
  region: string;
  /**
   * Optional, conditional on country+region (see lib/appellations.ts) — the
   * same curated map and conditional visibility actual-wine registration
   * uses. Never scored: see ScoredGuess.appellationGuess for how this is
   * carried through to display without affecting corePoints/bonusPoints/
   * totalPoints or fieldScores.
   */
  appellation: string;
  /** "" until the guest picks single/blend mode for this wine. */
  grapeBlendMode: GrapeBlendMode | "";
  grapeBlend: string;
  /** Blend mode only: grapes picked from the curated list. Empty/unused in single mode. */
  selectedGrapes: string[];
  /** Blend mode only: raw free text for varieties not on the curated list. Empty/unused in single mode. */
  otherGrapesText: string;
  /** Single mode only: see the identically-named field on WineIdentityInput. */
  otherGrapeSelected?: boolean;
  producer: string;
  wineName: string;
  vintage: string;
  /** Whole number 50-100. Null until the guest sets it. */
  rating: number | null;
  note?: string;
}

export interface GuestSubmission {
  id: string;
  guestId: string;
  guestName: string;
  sessionCode: string;
  guesses: WineGuess[];
  /** True once the guest has submitted; guesses become read-only. */
  locked: boolean;
  submittedAt?: string;
}

/**
 * legacy_v1 ONLY (see ScoringVersion) — every session created before the
 * scoring-model replacement: country, region, grape/blend, and vintage make
 * up a 100-point core score; producer and wine/cuvée are 20-point bonus
 * categories on top, for a 120-point maximum per wine. Never used for new
 * (core_v3_appellation_conditional) sessions — see CORE_V3_FIELD_POINTS.
 */
export const CORE_FIELD_POINTS = {
  country: 20,
  region: 30,
  grapeBlend: 30,
  vintage: 20,
} as const;

/** legacy_v1 only — see CORE_FIELD_POINTS. Producer/wine-cuvée are genuine core categories, not a bonus tier, under core_v3_appellation_conditional and core_v4_partial_credit — see CORE_V3_FIELD_POINTS. */
export const BONUS_FIELD_POINTS = {
  producer: 10,
  wineName: 10,
} as const;

export type CoreScorableField = keyof typeof CORE_FIELD_POINTS;
export type BonusScorableField = keyof typeof BONUS_FIELD_POINTS;
/** "appellation" is core_v3_appellation_conditional only — see CORE_V3_FIELD_POINTS. */
export type ScorableField = CoreScorableField | BonusScorableField | "appellation";

/** legacy_v1 only. */
export const CORE_MAX_POINTS = Object.values(CORE_FIELD_POINTS).reduce(
  (sum, p) => sum + p,
  0
);
/** legacy_v1 only. */
export const BONUS_MAX_POINTS = Object.values(BONUS_FIELD_POINTS).reduce(
  (sum, p) => sum + p,
  0
);
/** legacy_v1 only — a fixed 120-point-per-wine constant. core_v3_appellation_conditional's possible score varies per bottle (80 or 100); see ScoredGuess.totalPossiblePoints. */
export const TOTAL_MAX_POINTS_PER_WINE = CORE_MAX_POINTS + BONUS_MAX_POINTS;

/**
 * Shared by core_v3_appellation_conditional and core_v4_partial_credit (see
 * ScoringVersion): seven potential 20-point core categories, no bonus
 * category at all — Producer and wine/cuvée are reinstated as genuine scored
 * categories here (see README "Scoring model"), always applicable (unlike
 * conditional Appellation) since both are required answer-key fields at
 * bottle registration. Appellation is excluded entirely — from both the
 * guess's fieldScores and the possible-points denominator — whenever the
 * actual wine has no recorded Appellation; see calculateBlindScoreV3/
 * calculateBlindScoreV4 in lib/scoring.ts. Producer/wine-cuvée use their own
 * narrower matching rules (normalizeProducerForBlindMatch/
 * normalizeCuveeForBlindMatch in lib/normalize.ts) — deliberately not the
 * same lenient accent/punctuation-tolerant normalizeText every other field
 * here uses. Only the *leniency* of a near-miss differs between v3 (none)
 * and v4 (partial credit for Vintage/Grape-blend/Producer/Wine-cuvée) — the
 * point weights themselves are identical, hence one shared constant.
 */
export const CORE_V3_FIELD_POINTS = {
  country: 20,
  region: 20,
  appellation: 20,
  grapeBlend: 20,
  vintage: 20,
  producer: 20,
  wineName: 20,
} as const;

/** Per-field scoring breakdown for one guess against its answer key. */
export interface FieldScore {
  field: ScorableField;
  category: "core" | "bonus";
  /** Raw (un-normalised) guessed text, for display beside the answer. */
  guessedValue: string;
  /** Raw (un-normalised) answer-key text, for display beside the guess. */
  answerValue: string;
  correct: boolean;
  points: number;
  pointsAvailable: number;
  /**
   * core_v3_appellation_conditional and core_v4_partial_credit only, and
   * only ever on the "appellation" field: false means this category does
   * not apply to this wine at all — the actual wine has no recorded
   * Appellation, so there is nothing to score. Render as "Not applicable",
   * never "0/20" or a correct/incorrect badge. Absent or true for every
   * other field/version.
   */
  applicable?: boolean;
}

/**
 * The full per-bottle score breakdown for one guess, shared by both
 * core_v3_appellation_conditional and core_v4_partial_credit — see
 * lib/scoring.ts's calculateBlindScoreV3/calculateBlindScoreV4, the pure
 * functions that produce this shape, and README "Scoring model". Appellation
 * is conditionally excluded (both from scoring and from the denominator)
 * whenever the actual wine has no recorded Appellation; Producer and
 * wine/cuvée are always applicable (never conditionally excluded), scored
 * with their own narrower matchers — see CORE_V3_FIELD_POINTS. Only v4
 * changes *how* a near-miss on Vintage/Grape-blend/Producer/Wine-cuvée is
 * scored (partial credit instead of zero) — this shape needs no changes for
 * that, since `points`/`correct` were always independent fields.
 */
export interface BlindScoreResult {
  countryCorrect: boolean;
  countryPoints: number;
  countryPossiblePoints: 20;

  regionCorrect: boolean;
  regionPoints: number;
  regionPossiblePoints: 20;

  appellationApplicable: boolean;
  /** Null exactly when appellationApplicable is false — never a fabricated true/false for a category that doesn't exist for this wine. */
  appellationCorrect: boolean | null;
  appellationPoints: number;
  appellationPossiblePoints: 0 | 20;

  grapeBlendCorrect: boolean;
  grapeBlendPoints: number;
  grapeBlendPossiblePoints: 20;

  vintageCorrect: boolean;
  vintagePoints: number;
  vintagePossiblePoints: 20;

  /** Uses normalizeProducerForBlindMatch — case-insensitive plus tolerance for exactly one leading Château/Chateau/Domaine descriptor. Always applicable. */
  producerCorrect: boolean;
  producerPoints: number;
  producerPossiblePoints: 20;

  /** Uses normalizeCuveeForBlindMatch — case-insensitive only. Always applicable. */
  wineNameCorrect: boolean;
  wineNamePoints: number;
  wineNamePossiblePoints: 20;

  corePoints: number;
  /** 120 when the actual wine has no Appellation, 140 when it does. */
  corePossiblePoints: 120 | 140;

  /** Equal to corePoints under this model — there is no bonus category. */
  totalPoints: number;
  /** Equal to corePossiblePoints under this model. */
  totalPossiblePoints: 120 | 140;
}

export interface ScoredGuess {
  guestId: string;
  guestName: string;
  wineId: string;
  fieldScores: FieldScore[];
  /**
   * legacy_v1 only: the guest's raw appellation guess, carried straight
   * through for display only — never a FieldScore, never part of
   * corePoints/bonusPoints/totalPoints, no correctness computed. Undefined
   * under core_v3_appellation_conditional (there, Appellation is a genuine
   * scored FieldScore instead — see fieldScores) or when left blank.
   */
  appellationGuess?: string;
  /** Which model produced every number below — see ScoringVersion. */
  scoringVersion: ScoringVersion;
  /** core_v3_appellation_conditional only: whether the actual wine had a recorded Appellation at all. Always false (unused) under legacy_v1. */
  appellationApplicable: boolean;
  /** legacy_v1: country+region+grape/blend+vintage, 0-100. core_v3_appellation_conditional: country+region+appellation(if applicable)+grape/blend+vintage+producer+wine/cuvée, 0-120 or 0-140. */
  corePoints: number;
  /** legacy_v1: producer+wine/cuvée, 0-20. Always 0 under core_v3_appellation_conditional — Producer/wine-cuvée are scored core categories there instead (see fieldScores), not a separate bonus category. */
  bonusPoints: number;
  /** corePoints + bonusPoints. */
  totalPoints: number;
  /** This guess's own possible core points. legacy_v1: always CORE_MAX_POINTS (100). core_v3_appellation_conditional: 120 or 140 depending on whether the actual wine had an Appellation — never a fixed session-wide constant. */
  corePossiblePoints: number;
  /** legacy_v1: always BONUS_MAX_POINTS (20). Always 0 under core_v3_appellation_conditional. */
  bonusPossiblePoints: number;
  /** corePossiblePoints + bonusPossiblePoints. */
  totalPossiblePoints: number;
  /** corePoints / corePossiblePoints * 100. */
  coreAccuracyPercent: number;
  /** totalPoints / totalPossiblePoints * 100. */
  overallAccuracyPercent: number;
  rating: number | null;
  /**
   * The guest's own final submitted tasting note, carried straight through
   * for display only — never scored, never compared. Undefined/null when no
   * note was saved. Only ever rendered to viewers explicitly authorized to
   * see other participants' notes (see README "Results reveal" — the
   * completed-tasting shared report) — every other existing consumer of
   * ScoredGuess simply never reads this field.
   */
  note?: string | null;
}

export interface TasterOnWine {
  guestId: string;
  guestName: string;
  totalPoints: number;
  rating: number | null;
}

export interface WineResult {
  wine: WineAnswerKey;
  averageRating: number | null;
  numRatings: number;
  lowestRating: number | null;
  highestRating: number | null;
  ratingSpread: number | null;
  guesses: ScoredGuess[];
  /** Highest-scoring taster(s) for this wine; more than one entry means a tie. */
  topTasters: TasterOnWine[];
  /** The session's scoring model — every guess in `guesses` shares this same version. See ScoringVersion. */
  scoringVersion: ScoringVersion;
}

export interface TasterResult {
  guestId: string;
  guestName: string;
  rank: number;
  totalPoints: number;
  /**
   * legacy_v1: a fixed session-wide constant (TOTAL_MAX_POINTS_PER_WINE *
   * number of wines), matching this model's original, unchanged ranking
   * behaviour. core_v3_appellation_conditional: the sum of each *submitted*
   * guess's own totalPossiblePoints — bottles the taster never guessed on
   * are excluded from both totalPoints and totalPossible, so a taster who
   * only saw 80-point wines is compared fairly against one who saw 100-point
   * wines. See lib/results.ts.
   */
  totalPossible: number;
  corePoints: number;
  corePossible: number;
  /** Always 0/0 under core_v3_appellation_conditional — there is no bonus category in that model. */
  bonusPoints: number;
  bonusPossible: number;
  /** totalPoints / totalPossible * 100. core_v3_appellation_conditional's primary ranking key — see lib/results.ts. */
  overallAccuracyPercent: number;
  /** corePoints / corePossible * 100. */
  coreAccuracyPercent: number;
  /** Count of core-category fields correct across every submitted wine. Tie-break: last for legacy_v1, third for core_v3_appellation_conditional (after percentage and raw points). */
  exactCoreMatches: number;
  /** Number of wines this taster actually submitted a guess for. core_v3_appellation_conditional's second tie-break (after raw points, before exactCoreMatches) — see lib/results.ts. */
  submittedGuessCount: number;
  averageRatingGiven: number | null;
}

export interface TastingReport {
  wineResults: WineResult[];
  tasterResults: TasterResult[];
  /** Wine(s) with the highest average rating; more than one entry means a tie. */
  wineOfTheNight: WineResult[];
  /** Guest(s) tied for rank 1 on the leaderboard; more than one entry means a tie. Ranked by percentage accuracy under core_v3_appellation_conditional, raw points under legacy_v1 — see lib/results.ts. */
  bestTaster: TasterResult[];
  /** Wine(s) with the largest rating spread; more than one entry means a tie. */
  mostDivisiveWine: WineResult[];
  /** This session's scoring model — every wineResult/tasterResult here shares this same version. See ScoringVersion. */
  scoringVersion: ScoringVersion;
}

/**
 * Seen tasting (see README "Tasting modes") is a rating-only format — no
 * identification guessing, no scoring, no Best Taster. These types are
 * deliberately separate from WineResult/ScoredGuess/TastingReport above
 * (which are all guess-scoring shapes) so lib/seenResults.ts never needs to
 * fabricate fake scoring data, and full_blind/course_reveal's report types
 * are never touched by this mode.
 */
export interface SeenParticipantRating {
  guestId: string;
  guestName: string;
  /** Null means this participant never rated this bottle — never fabricated as 0. */
  rating: number | null;
  note?: string;
}

export interface SeenBottleResult {
  wine: WineAnswerKey;
  /** 1-based rank by average rating (ties share a rank), same convention as TasterResult.rank. */
  rank: number;
  averageRating: number | null;
  numRatings: number;
  lowestRating: number | null;
  highestRating: number | null;
  ratingSpread: number | null;
  /** Every participant in the session, in join order — including those with rating: null. */
  participantRatings: SeenParticipantRating[];
}

export interface SeenTastingReport {
  /** Ranked highest average rating first — see calculateSeenBottleResults for the full tie-break order. */
  bottleResults: SeenBottleResult[];
  /** Highest average rating; spread breaks ties; more than one entry means a shared tie. */
  wineOfTheNight: SeenBottleResult[];
  /** Largest rating spread; more than one entry means a tie. */
  mostDivisiveWine: SeenBottleResult[];
  totalRatings: number;
  /** Distinct guests who rated at least one bottle. */
  totalRaters: number;
  totalBottles: number;
}

/**
 * Blind match (see README "Tasting modes") scores each glass a plain 1/0 —
 * did the participant match it to its actual wine or not — deliberately
 * never the field-by-field partial-credit scoring WineGuess/ScoredGuess/
 * TastingReport represent. Separate from Seen's types too: unlike Seen,
 * this mode has real correctness and a taster leaderboard, so it's not a
 * pure rating-only shape either.
 */
export interface MatchParticipantPick {
  guestId: string;
  guestName: string;
  /** Null means this participant never picked a wine for this glass — never fabricated. */
  pickedWine: WineAnswerKey | null;
  /** Null exactly when pickedWine is null; otherwise pickedWine.id === this glass's wine.id. */
  correct: boolean | null;
  rating: number | null;
  note?: string;
}

export interface MatchBottleResult {
  wine: WineAnswerKey;
  /** 1-based rank by average rating (ties share a rank), same convention as SeenBottleResult.rank. */
  rank: number;
  averageRating: number | null;
  numRatings: number;
  lowestRating: number | null;
  highestRating: number | null;
  ratingSpread: number | null;
  /** How many participants matched this glass to its actual wine. */
  correctCount: number;
  /** Participants who made any pick at all for this glass (correct or not). */
  totalPicks: number;
  /** Every participant in the session, in join order — including those with pickedWine: null. */
  participantPicks: MatchParticipantPick[];
}

export interface MatchTasterResult {
  guestId: string;
  guestName: string;
  correctCount: number;
  totalBottles: number;
  /** 0 when totalBottles is 0 — never NaN. */
  accuracyPercent: number;
  /** 1-based rank by correctCount descending (ties share a rank). */
  rank: number;
}

export interface MatchTastingReport {
  /** Ranked highest average rating first, same tie-break order as Seen. */
  bottleResults: MatchBottleResult[];
  /** Ranked highest correctCount first. */
  tasterResults: MatchTasterResult[];
  /** Highest average rating; spread breaks ties; more than one entry means a shared tie. */
  wineOfTheNight: MatchBottleResult[];
  /** Largest rating spread; more than one entry means a tie. */
  mostDivisiveWine: MatchBottleResult[];
  totalRatings: number;
  /** Distinct guests who rated at least one bottle. */
  totalRaters: number;
  totalBottles: number;
  totalParticipants: number;
}
