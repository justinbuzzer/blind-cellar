import {
  BlindScoreResult,
  BONUS_FIELD_POINTS,
  BonusScorableField,
  CORE_FIELD_POINTS,
  CORE_MAX_POINTS,
  CORE_V3_FIELD_POINTS,
  CoreScorableField,
  FieldScore,
  GrapeBlendMode,
  ScoredGuess,
  ScoringVersion,
  TOTAL_MAX_POINTS_PER_WINE,
  WineAnswerKey,
  WineGuess,
} from "@/types/tasting";
import { isNormalizedMatch } from "./normalize";
import { blendTokensFromText, canonicalizeGrapeToken } from "./wineReferenceData";
import { round1 } from "./math";

type CoreTextField = "country" | "region" | "vintage";
type BonusTextField = "producer" | "wineName";

/** Scores a core free-text field. Exact normalised match only. legacy_v1 only — see CORE_FIELD_POINTS. */
export function scoreCoreTextField(
  field: CoreTextField,
  guess: string,
  answer: string
): FieldScore {
  const correct = isNormalizedMatch(guess, answer);
  const pointsAvailable = CORE_FIELD_POINTS[field as CoreScorableField];
  return {
    field,
    category: "core",
    guessedValue: guess.trim() || "—",
    answerValue: answer || "—",
    correct,
    points: correct ? pointsAvailable : 0,
    pointsAvailable,
  };
}

/** Scores a bonus free-text field (producer, wine/cuvée). Exact normalised match only. legacy_v1 only — there is no bonus category under core_v3_appellation_conditional. */
export function scoreBonusTextField(
  field: BonusTextField,
  guess: string,
  answer: string
): FieldScore {
  const correct = isNormalizedMatch(guess, answer);
  const pointsAvailable = BONUS_FIELD_POINTS[field as BonusScorableField];
  return {
    field,
    category: "bonus",
    guessedValue: guess.trim() || "—",
    answerValue: answer || "—",
    correct,
    points: correct ? pointsAvailable : 0,
    pointsAvailable,
  };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || a.size !== b.size) return false;
  return Array.from(a).every((value) => b.has(value));
}

/**
 * Scores the grape/blend core field. Shared by both scoring versions —
 * `pointsAvailable` defaults to legacy_v1's 30 points; core_v3_appellation_conditional
 * calls this with CORE_V3_FIELD_POINTS.grapeBlend (20) explicitly.
 *
 * - If both sides have a known, matching mode ("single" or "blend"), score
 *   using that mode's comparison: single-variety is an exact canonical
 *   match; blend is an exact match of the canonicalised grape *set*,
 *   ignoring order — no credit for partial overlap.
 * - If both sides have a known but *different* mode, it's a mismatch: zero
 *   points, even if the text happens to overlap.
 * - If either side's mode is unknown ("" — legacy data predating this
 *   field, or a guess that hasn't picked a mode yet), fall back to a plain
 *   alias-aware canonical text comparison. This keeps old grape/style
 *   free-text answers scoring sensibly against both old and new guesses
 *   without ever auto-detecting an unfamiliar grape.
 */
export function scoreGrapeBlend(
  guessMode: GrapeBlendMode | "",
  guessValue: string,
  answerMode: GrapeBlendMode | "",
  answerValue: string,
  pointsAvailable: number = CORE_FIELD_POINTS.grapeBlend
): FieldScore {
  const guessedValue = guessValue.trim() || "—";
  const answerText = answerValue || "—";

  let correct = false;
  if (guessValue.trim() && answerValue.trim()) {
    if (guessMode && answerMode) {
      if (guessMode === answerMode) {
        correct =
          answerMode === "single"
            ? canonicalizeGrapeToken(guessValue) === canonicalizeGrapeToken(answerValue)
            : setsEqual(
                new Set(blendTokensFromText(guessValue)),
                new Set(blendTokensFromText(answerValue))
              );
      } else {
        correct = false; // mismatched mode: never award points
      }
    } else {
      // Unknown mode on at least one side (legacy data or an unset guess):
      // fall back to alias-aware canonical text comparison.
      correct = canonicalizeGrapeToken(guessValue) === canonicalizeGrapeToken(answerValue);
    }
  }

  return {
    field: "grapeBlend",
    category: "core",
    guessedValue,
    answerValue: answerText,
    correct,
    points: correct ? pointsAvailable : 0,
    pointsAvailable,
  };
}

/**
 * legacy_v1 ONLY (see ScoringVersion) — country(20)/region(30)/grape-blend(30)/
 * vintage(20) core (100 max) plus producer(10)/wine-cuvée(10) bonus (20 max),
 * 120 max total. This function's math must never change: historic sessions
 * depend on it producing byte-for-byte identical results forever. New
 * sessions use scoreWineGuessCoreV3 instead — see the scoreWineGuess
 * dispatcher below.
 */
export function scoreWineGuessLegacyV1(
  guestId: string,
  guestName: string,
  guess: WineGuess,
  answer: WineAnswerKey
): ScoredGuess {
  const fieldScores: FieldScore[] = [
    scoreCoreTextField("country", guess.country, answer.country),
    scoreCoreTextField("region", guess.region, answer.region),
    scoreGrapeBlend(guess.grapeBlendMode, guess.grapeBlend, answer.grapeBlendMode, answer.grapeBlend),
    scoreCoreTextField("vintage", guess.vintage, answer.vintage),
    scoreBonusTextField("producer", guess.producer, answer.producer),
    scoreBonusTextField("wineName", guess.wineName, answer.wineName),
  ];

  const corePoints = fieldScores
    .filter((f) => f.category === "core")
    .reduce((sum, f) => sum + f.points, 0);
  const bonusPoints = fieldScores
    .filter((f) => f.category === "bonus")
    .reduce((sum, f) => sum + f.points, 0);
  const totalPoints = corePoints + bonusPoints;

  return {
    guestId,
    guestName,
    wineId: guess.wineId,
    fieldScores,
    // Not a FieldScore: appellation is never scored under legacy_v1 (see
    // README "Region and Appellation"). Carried through purely so
    // report/reveal views can show it without recomputing anything from the
    // raw guess row.
    appellationGuess: guess.appellation || undefined,
    scoringVersion: "legacy_v1",
    appellationApplicable: false,
    corePoints,
    bonusPoints,
    totalPoints,
    corePossiblePoints: CORE_MAX_POINTS,
    bonusPossiblePoints: BONUS_FIELD_POINTS.producer + BONUS_FIELD_POINTS.wineName,
    totalPossiblePoints: TOTAL_MAX_POINTS_PER_WINE,
    coreAccuracyPercent: round1((corePoints / CORE_MAX_POINTS) * 100),
    overallAccuracyPercent: round1((totalPoints / TOTAL_MAX_POINTS_PER_WINE) * 100),
    rating: guess.rating,
    confidence: guess.confidence,
  };
}

/**
 * core_v3_appellation_conditional ONLY (see ScoringVersion) — the pure score
 * calculation, isolated from ScoredGuess/FieldScore assembly so it can be
 * unit-tested directly against the exact shape the task spec requires.
 *
 * Five potential 20-point categories: country, region, appellation (only
 * when the actual wine has one), grape/blend, vintage. No bonus category —
 * producer/wine-cuvée are never scored under this model. Appellation
 * correctness is a plain exact normalised-match comparison against the
 * guess, independent of whether country/region/grape/vintage are correct —
 * never inferred from any other field, never a partial match.
 */
export function calculateBlindScoreV3(guess: WineGuess, answer: WineAnswerKey): BlindScoreResult {
  const countryCorrect = isNormalizedMatch(guess.country, answer.country);
  const regionCorrect = isNormalizedMatch(guess.region, answer.region);
  const grapeBlendScore = scoreGrapeBlend(
    guess.grapeBlendMode,
    guess.grapeBlend,
    answer.grapeBlendMode,
    answer.grapeBlend,
    CORE_V3_FIELD_POINTS.grapeBlend
  );
  const vintageCorrect = isNormalizedMatch(guess.vintage, answer.vintage);

  const actualAppellation = (answer.appellation ?? "").trim();
  const appellationApplicable = actualAppellation.length > 0;
  const appellationCorrect = appellationApplicable
    ? isNormalizedMatch(guess.appellation, actualAppellation)
    : null;

  const countryPoints = countryCorrect ? CORE_V3_FIELD_POINTS.country : 0;
  const regionPoints = regionCorrect ? CORE_V3_FIELD_POINTS.region : 0;
  const appellationPoints = appellationApplicable && appellationCorrect ? CORE_V3_FIELD_POINTS.appellation : 0;
  const appellationPossiblePoints: 0 | 20 = appellationApplicable ? CORE_V3_FIELD_POINTS.appellation : 0;
  const grapeBlendPoints = grapeBlendScore.points;
  const vintagePoints = vintageCorrect ? CORE_V3_FIELD_POINTS.vintage : 0;

  const corePossiblePoints: 80 | 100 = appellationApplicable ? 100 : 80;
  const corePoints = countryPoints + regionPoints + appellationPoints + grapeBlendPoints + vintagePoints;

  return {
    countryCorrect,
    countryPoints,
    countryPossiblePoints: 20,
    regionCorrect,
    regionPoints,
    regionPossiblePoints: 20,
    appellationApplicable,
    appellationCorrect,
    appellationPoints,
    appellationPossiblePoints,
    grapeBlendCorrect: grapeBlendScore.correct,
    grapeBlendPoints,
    grapeBlendPossiblePoints: 20,
    vintageCorrect,
    vintagePoints,
    vintagePossiblePoints: 20,
    corePoints,
    corePossiblePoints,
    totalPoints: corePoints,
    totalPossiblePoints: corePossiblePoints,
  };
}

/**
 * core_v3_appellation_conditional ONLY — wraps calculateBlindScoreV3 into the
 * shared ScoredGuess shape the report/leaderboard pipeline (lib/results.ts)
 * already knows how to aggregate. Producer/wine-cuvée are carried through as
 * unscored passthroughs (producerGuess/wineCuveeGuess), the same pattern
 * legacy_v1 already used for its own unscored appellationGuess.
 */
export function scoreWineGuessCoreV3(
  guestId: string,
  guestName: string,
  guess: WineGuess,
  answer: WineAnswerKey
): ScoredGuess {
  const blind = calculateBlindScoreV3(guess, answer);
  const actualAppellation = (answer.appellation ?? "").trim();

  const fieldScores: FieldScore[] = [
    {
      field: "country",
      category: "core",
      guessedValue: guess.country.trim() || "—",
      answerValue: answer.country || "—",
      correct: blind.countryCorrect,
      points: blind.countryPoints,
      pointsAvailable: blind.countryPossiblePoints,
    },
    {
      field: "region",
      category: "core",
      guessedValue: guess.region.trim() || "—",
      answerValue: answer.region || "—",
      correct: blind.regionCorrect,
      points: blind.regionPoints,
      pointsAvailable: blind.regionPossiblePoints,
    },
    {
      field: "appellation",
      category: "core",
      guessedValue: guess.appellation.trim() || "—",
      answerValue: actualAppellation || "—",
      correct: blind.appellationCorrect ?? false,
      points: blind.appellationPoints,
      pointsAvailable: blind.appellationPossiblePoints,
      applicable: blind.appellationApplicable,
    },
    {
      field: "grapeBlend",
      category: "core",
      guessedValue: guess.grapeBlend.trim() || "—",
      answerValue: answer.grapeBlend || "—",
      correct: blind.grapeBlendCorrect,
      points: blind.grapeBlendPoints,
      pointsAvailable: blind.grapeBlendPossiblePoints,
    },
    {
      field: "vintage",
      category: "core",
      guessedValue: guess.vintage.trim() || "—",
      answerValue: answer.vintage || "—",
      correct: blind.vintageCorrect,
      points: blind.vintagePoints,
      pointsAvailable: blind.vintagePossiblePoints,
    },
  ];

  return {
    guestId,
    guestName,
    wineId: guess.wineId,
    fieldScores,
    appellationGuess: undefined,
    producerGuess: guess.producer.trim() || undefined,
    wineCuveeGuess: guess.wineName.trim() || undefined,
    scoringVersion: "core_v3_appellation_conditional",
    appellationApplicable: blind.appellationApplicable,
    corePoints: blind.corePoints,
    bonusPoints: 0,
    totalPoints: blind.totalPoints,
    corePossiblePoints: blind.corePossiblePoints,
    bonusPossiblePoints: 0,
    totalPossiblePoints: blind.totalPossiblePoints,
    coreAccuracyPercent:
      blind.corePossiblePoints > 0 ? round1((blind.corePoints / blind.corePossiblePoints) * 100) : 0,
    overallAccuracyPercent:
      blind.totalPossiblePoints > 0 ? round1((blind.totalPoints / blind.totalPossiblePoints) * 100) : 0,
    rating: guess.rating,
    confidence: guess.confidence,
  };
}

/**
 * Scores one guest's full guess for one wine against its answer key, under
 * the given session's scoring version. This is the only entry point the rest
 * of the app (lib/results.ts, lib/supabase/mappers.ts) should call — it
 * keeps the two scoring models' math completely isolated in their own named
 * functions above rather than branching inline.
 */
export function scoreWineGuess(
  guestId: string,
  guestName: string,
  guess: WineGuess,
  answer: WineAnswerKey,
  scoringVersion: ScoringVersion
): ScoredGuess {
  return scoringVersion === "core_v3_appellation_conditional"
    ? scoreWineGuessCoreV3(guestId, guestName, guess, answer)
    : scoreWineGuessLegacyV1(guestId, guestName, guess, answer);
}
