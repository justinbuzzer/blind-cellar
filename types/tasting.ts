// Core data model for a single local Blind Cellar tasting session.
// Everything here is plain, serialisable data so it can be persisted to
// localStorage as JSON without any transformation.

export type Confidence = "low" | "medium" | "high";

export const CONFIDENCE_LEVELS: Confidence[] = ["low", "medium", "high"];

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

/** The private answer key for one bottle. Never shown to other participants before reveal. */
export interface WineAnswerKey {
  id: string;
  /** Anonymous label shown to participants, e.g. "Bottle 1". Assigned in order. */
  code: string;
  country: string;
  region: string;
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
}

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
export type TastingMode = "full_blind" | "course_reveal";

export const TASTING_MODES: TastingMode[] = ["full_blind", "course_reveal"];

export const TASTING_MODE_LABELS: Record<TastingMode, string> = {
  full_blind: "Full blind tasting",
  course_reveal: "Course-by-course reveal",
};

export const TASTING_MODE_DESCRIPTIONS: Record<TastingMode, string> = {
  full_blind:
    "All bottles are tasted blind before any wines are revealed. Best for comparative tastings where complete objectivity matters.",
  course_reveal:
    "Each bottle is tasted blind, then revealed before moving to the next. Best for casual dinners and relaxed tasting discussions.",
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
  /** "" until the guest picks single/blend mode for this wine. */
  grapeBlendMode: GrapeBlendMode | "";
  grapeBlend: string;
  /** Blend mode only: grapes picked from the curated list. Empty/unused in single mode. */
  selectedGrapes: string[];
  /** Blend mode only: raw free text for varieties not on the curated list. Empty/unused in single mode. */
  otherGrapesText: string;
  producer: string;
  wineName: string;
  vintage: string;
  /** Whole number 50-100. Null until the guest sets it. */
  rating: number | null;
  confidence: Confidence;
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
 * The new scoring model (replaces the old flat 75-point-per-wine model):
 * country, region, grape/blend, and vintage make up a 100-point core score;
 * producer and wine/cuvée are 20-point bonus categories on top, for a
 * 120-point maximum per wine. Price band is never scored.
 */
export const CORE_FIELD_POINTS = {
  country: 20,
  region: 30,
  grapeBlend: 30,
  vintage: 20,
} as const;

export const BONUS_FIELD_POINTS = {
  producer: 10,
  wineName: 10,
} as const;

export type CoreScorableField = keyof typeof CORE_FIELD_POINTS;
export type BonusScorableField = keyof typeof BONUS_FIELD_POINTS;
export type ScorableField = CoreScorableField | BonusScorableField;

export const CORE_MAX_POINTS = Object.values(CORE_FIELD_POINTS).reduce(
  (sum, p) => sum + p,
  0
);
export const BONUS_MAX_POINTS = Object.values(BONUS_FIELD_POINTS).reduce(
  (sum, p) => sum + p,
  0
);
export const TOTAL_MAX_POINTS_PER_WINE = CORE_MAX_POINTS + BONUS_MAX_POINTS;

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
}

export interface ScoredGuess {
  guestId: string;
  guestName: string;
  wineId: string;
  fieldScores: FieldScore[];
  /** 0-100: country + region + grape/blend + vintage. */
  corePoints: number;
  /** 0-20: producer + wine/cuvée. */
  bonusPoints: number;
  /** 0-120: corePoints + bonusPoints. */
  totalPoints: number;
  /** corePoints / 100 * 100. */
  coreAccuracyPercent: number;
  /** totalPoints / 120 * 100. */
  overallAccuracyPercent: number;
  rating: number | null;
  confidence: Confidence;
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
}

export interface TasterResult {
  guestId: string;
  guestName: string;
  rank: number;
  totalPoints: number;
  totalPossible: number;
  corePoints: number;
  corePossible: number;
  bonusPoints: number;
  bonusPossible: number;
  /** totalPoints / totalPossible * 100. */
  overallAccuracyPercent: number;
  /** corePoints / corePossible * 100. */
  coreAccuracyPercent: number;
  /** Count of core-category (country/region/grape-blend/vintage) fields correct across every wine. Used as the final tie-break. */
  exactCoreMatches: number;
  averageRatingGiven: number | null;
}

export interface TastingReport {
  wineResults: WineResult[];
  tasterResults: TasterResult[];
  /** Wine(s) with the highest average rating; more than one entry means a tie. */
  wineOfTheNight: WineResult[];
  /** Guest(s) tied for rank 1 on the leaderboard; more than one entry means a tie. */
  bestTaster: TasterResult[];
  /** Wine(s) with the largest rating spread; more than one entry means a tie. */
  mostDivisiveWine: WineResult[];
}
