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
import {
  isCuveeBlindMatch,
  isNormalizedMatch,
  isProducerBlindMatch,
  levenshteinDistance,
  normalizeCuveeForBlindMatch,
  normalizeProducerForBlindMatch,
} from "./normalize";
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

/** Jaccard similarity (intersection size / union size) between two grape sets — 0 when the union is empty (both sides tokenised to nothing). core_v4_partial_credit only. */
function jaccardOverlap(a: Set<string>, b: Set<string>): number {
  const union = new Set(Array.from(a).concat(Array.from(b)));
  if (union.size === 0) return 0;
  const intersectionSize = Array.from(a).filter((value) => b.has(value)).length;
  return intersectionSize / union.size;
}

/**
 * Scores the grape/blend core field. Shared by all three scoring versions —
 * `pointsAvailable` defaults to legacy_v1's 30 points; core_v3_appellation_conditional
 * and core_v4_partial_credit call this with CORE_V3_FIELD_POINTS.grapeBlend
 * (20) explicitly.
 *
 * - If both sides have a known, matching mode ("single" or "blend"), score
 *   using that mode's comparison: single-variety is an exact canonical
 *   match; blend is an exact match of the canonicalised grape *set*,
 *   ignoring order. When it isn't an exact set match and `allowPartialCredit`
 *   is true (core_v4_partial_credit only — defaults to false, so legacy_v1
 *   and core_v3_appellation_conditional's calls are completely unaffected),
 *   award proportional credit via Jaccard overlap instead of zero.
 * - If both sides have a known but *different* mode, it's a mismatch: zero
 *   points, even if the text happens to overlap — `allowPartialCredit` never
 *   applies here.
 * - If either side's mode is unknown ("" — legacy data predating this
 *   field, or a guess that hasn't picked a mode yet), fall back to a plain
 *   alias-aware canonical text comparison. This keeps old grape/style
 *   free-text answers scoring sensibly against both old and new guesses
 *   without ever auto-detecting an unfamiliar grape — `allowPartialCredit`
 *   never applies here either.
 */
export function scoreGrapeBlend(
  guessMode: GrapeBlendMode | "",
  guessValue: string,
  answerMode: GrapeBlendMode | "",
  answerValue: string,
  pointsAvailable: number = CORE_FIELD_POINTS.grapeBlend,
  allowPartialCredit: boolean = false
): FieldScore {
  const guessedValue = guessValue.trim() || "—";
  const answerText = answerValue || "—";

  let correct = false;
  let points = 0;
  if (guessValue.trim() && answerValue.trim()) {
    if (guessMode && answerMode) {
      if (guessMode === answerMode) {
        if (answerMode === "single") {
          correct = canonicalizeGrapeToken(guessValue) === canonicalizeGrapeToken(answerValue);
          points = correct ? pointsAvailable : 0;
        } else {
          const guessSet = new Set(blendTokensFromText(guessValue));
          const answerSet = new Set(blendTokensFromText(answerValue));
          correct = setsEqual(guessSet, answerSet);
          if (correct) {
            points = pointsAvailable;
          } else if (allowPartialCredit) {
            points = Math.round(jaccardOverlap(guessSet, answerSet) * pointsAvailable);
          }
        }
      }
      // mismatched mode: never award points, even with allowPartialCredit
    } else {
      // Unknown mode on at least one side (legacy data or an unset guess):
      // fall back to alias-aware canonical text comparison.
      correct = canonicalizeGrapeToken(guessValue) === canonicalizeGrapeToken(answerValue);
      points = correct ? pointsAvailable : 0;
    }
  }

  return {
    field: "grapeBlend",
    category: "core",
    guessedValue,
    answerValue: answerText,
    correct,
    points,
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
    note: guess.note ?? null,
  };
}

/**
 * core_v3_appellation_conditional ONLY (see ScoringVersion) — the pure score
 * calculation, isolated from ScoredGuess/FieldScore assembly so it can be
 * unit-tested directly against the exact shape the task spec requires.
 *
 * Seven potential 20-point categories: country, region, appellation (only
 * when the actual wine has one), grape/blend, vintage, producer, wine/cuvée.
 * No bonus category — Producer/wine-cuvée are scored core categories here,
 * not a separate bonus tier (see README "Scoring model"). Appellation
 * correctness is a plain exact normalised-match comparison against the
 * guess, independent of whether country/region/grape/vintage are correct —
 * never inferred from any other field, never a partial match. Producer uses
 * normalizeProducerForBlindMatch (case-insensitive, tolerant of exactly one
 * leading Château/Chateau/Domaine descriptor); wine/cuvée uses
 * normalizeCuveeForBlindMatch (case-insensitive only) — both deliberately
 * narrower than isNormalizedMatch's accent/punctuation-lenient comparison
 * used by every other field here, and both always applicable (never
 * conditionally excluded like Appellation), since both are required
 * answer-key fields at bottle registration.
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
  const producerCorrect = isProducerBlindMatch(guess.producer, answer.producer);
  const wineNameCorrect = isCuveeBlindMatch(guess.wineName, answer.wineName);

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
  const producerPoints = producerCorrect ? CORE_V3_FIELD_POINTS.producer : 0;
  const wineNamePoints = wineNameCorrect ? CORE_V3_FIELD_POINTS.wineName : 0;

  const corePossiblePoints: 120 | 140 = appellationApplicable ? 140 : 120;
  const corePoints =
    countryPoints +
    regionPoints +
    appellationPoints +
    grapeBlendPoints +
    vintagePoints +
    producerPoints +
    wineNamePoints;

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
    producerCorrect,
    producerPoints,
    producerPossiblePoints: 20,
    wineNameCorrect,
    wineNamePoints,
    wineNamePossiblePoints: 20,
    corePoints,
    corePossiblePoints,
    totalPoints: corePoints,
    totalPossiblePoints: corePossiblePoints,
  };
}

/**
 * core_v3_appellation_conditional ONLY — wraps calculateBlindScoreV3 into the
 * shared ScoredGuess shape the report/leaderboard pipeline (lib/results.ts)
 * already knows how to aggregate. Producer/wine-cuvée are genuine scored
 * FieldScores here (category "core", always applicable) — there is no
 * unscored passthrough for them under this model, unlike legacy_v1's
 * unscored appellationGuess.
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
    {
      field: "producer",
      category: "core",
      guessedValue: guess.producer.trim() || "—",
      answerValue: answer.producer || "—",
      correct: blind.producerCorrect,
      points: blind.producerPoints,
      pointsAvailable: blind.producerPossiblePoints,
    },
    {
      field: "wineName",
      category: "core",
      guessedValue: guess.wineName.trim() || "—",
      answerValue: answer.wineName || "—",
      correct: blind.wineNameCorrect,
      points: blind.wineNamePoints,
      pointsAvailable: blind.wineNamePossiblePoints,
    },
  ];

  return {
    guestId,
    guestName,
    wineId: guess.wineId,
    fieldScores,
    appellationGuess: undefined,
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
    note: guess.note ?? null,
  };
}

/**
 * core_v4_partial_credit ONLY. Exact match (via isNormalizedMatch, still
 * covers NV===NV) earns full points. Otherwise, when both sides parse as
 * plain 4-digit years and are exactly 1 year apart, half credit. Anything
 * else — 2+ years apart, a malformed/blank value on either side, or NV
 * paired with a specific year (no numeric distance is definable between
 * them) — earns zero. Never used by legacy_v1/core_v3_appellation_conditional,
 * whose vintage comparison stays the plain scoreCoreTextField/inline
 * isNormalizedMatch check they've always used.
 */
export function scoreVintageWithPartialCredit(
  guess: string,
  answer: string,
  pointsAvailable: number = CORE_V3_FIELD_POINTS.vintage
): FieldScore {
  const guessedValue = guess.trim() || "—";
  const answerValue = answer || "—";

  const exact = isNormalizedMatch(guess, answer);
  const correct = exact;
  let points = 0;

  if (exact) {
    points = pointsAvailable;
  } else {
    const guessYear = parseFourDigitYear(guess);
    const answerYear = parseFourDigitYear(answer);
    if (guessYear !== null && answerYear !== null && Math.abs(guessYear - answerYear) === 1) {
      points = Math.round(pointsAvailable / 2);
    }
  }

  return {
    field: "vintage",
    category: "core",
    guessedValue,
    answerValue,
    correct,
    points,
    pointsAvailable,
  };
}

function parseFourDigitYear(value: string): number | null {
  const trimmed = value.trim();
  return /^\d{4}$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
}

/**
 * How close a near-miss normalized string pair needs to be (as a fraction of
 * the longer string's length) to earn partial credit — core_v4_partial_credit
 * only. Floored (not ceiled), so a name under ~7 normalized characters gets a
 * threshold of 0 (no partial credit for very short names, where a 1-character
 * edit is a large relative change, not a typo) with no separate carve-out
 * needed.
 */
const PARTIAL_CREDIT_MAX_RELATIVE_DISTANCE = 0.15;

function isWithinPartialCreditDistance(normGuess: string, normAnswer: string): boolean {
  const distance = levenshteinDistance(normGuess, normAnswer);
  if (distance === 0) return false; // exact match is handled separately, before this is ever called
  const threshold = Math.floor(Math.max(normGuess.length, normAnswer.length) * PARTIAL_CREDIT_MAX_RELATIVE_DISTANCE);
  return threshold > 0 && distance <= threshold;
}

/**
 * core_v4_partial_credit ONLY. Exact match, via the same unchanged
 * isProducerBlindMatch core_v3_appellation_conditional already uses, earns
 * full points. Otherwise, a close-spelling near-miss (small Levenshtein
 * distance on the same normalizeProducerForBlindMatch text, relative to the
 * longer string's length — see isWithinPartialCreditDistance) earns half
 * credit. A blank guess never earns partial credit (normalizeProducerForBlindMatch
 * returns null for blank, same as the exact-match path).
 */
export function scoreProducerWithPartialCredit(
  guess: string,
  answer: string,
  pointsAvailable: number = CORE_V3_FIELD_POINTS.producer
): FieldScore {
  const guessedValue = guess.trim() || "—";
  const answerValue = answer || "—";

  const correct = isProducerBlindMatch(guess, answer);
  let points = 0;
  if (correct) {
    points = pointsAvailable;
  } else {
    const normGuess = normalizeProducerForBlindMatch(guess);
    const normAnswer = normalizeProducerForBlindMatch(answer);
    if (normGuess !== null && normAnswer !== null && isWithinPartialCreditDistance(normGuess, normAnswer)) {
      points = Math.round(pointsAvailable / 2);
    }
  }

  return {
    field: "producer",
    category: "core",
    guessedValue,
    answerValue,
    correct,
    points,
    pointsAvailable,
  };
}

/**
 * core_v4_partial_credit ONLY. Same treatment as scoreProducerWithPartialCredit,
 * using isCuveeBlindMatch/normalizeCuveeForBlindMatch instead — see that
 * function's doc comment for the shared close-spelling rule.
 */
export function scoreCuveeWithPartialCredit(
  guess: string,
  answer: string,
  pointsAvailable: number = CORE_V3_FIELD_POINTS.wineName
): FieldScore {
  const guessedValue = guess.trim() || "—";
  const answerValue = answer || "—";

  const correct = isCuveeBlindMatch(guess, answer);
  let points = 0;
  if (correct) {
    points = pointsAvailable;
  } else {
    const normGuess = normalizeCuveeForBlindMatch(guess);
    const normAnswer = normalizeCuveeForBlindMatch(answer);
    if (normGuess !== null && normAnswer !== null && isWithinPartialCreditDistance(normGuess, normAnswer)) {
      points = Math.round(pointsAvailable / 2);
    }
  }

  return {
    field: "wineName",
    category: "core",
    guessedValue,
    answerValue,
    correct,
    points,
    pointsAvailable,
  };
}

/**
 * core_v4_partial_credit ONLY — the pure score calculation, structured
 * identically to (and deliberately not delegating to) calculateBlindScoreV3:
 * this is a full, independent copy, not a shared branchy implementation, so
 * core_v3_appellation_conditional sessions can never be affected by a change
 * here. Country, Region, and Appellation logic is unchanged from v3 (plain
 * exact match, Appellation conditionally excluded when the actual wine has
 * none). The only difference from v3: Vintage, Grape/blend, and
 * Producer/Wine-cuvée each route through their new partial-credit scorer
 * above instead of an exact-match-or-nothing check. Point weights and the
 * 120/140 conditional-Appellation denominator are unchanged — see
 * CORE_V3_FIELD_POINTS.
 */
export function calculateBlindScoreV4(guess: WineGuess, answer: WineAnswerKey): BlindScoreResult {
  const countryCorrect = isNormalizedMatch(guess.country, answer.country);
  const regionCorrect = isNormalizedMatch(guess.region, answer.region);
  const grapeBlendScore = scoreGrapeBlend(
    guess.grapeBlendMode,
    guess.grapeBlend,
    answer.grapeBlendMode,
    answer.grapeBlend,
    CORE_V3_FIELD_POINTS.grapeBlend,
    true
  );
  const vintageScore = scoreVintageWithPartialCredit(guess.vintage, answer.vintage, CORE_V3_FIELD_POINTS.vintage);
  const producerScore = scoreProducerWithPartialCredit(guess.producer, answer.producer, CORE_V3_FIELD_POINTS.producer);
  const wineNameScore = scoreCuveeWithPartialCredit(guess.wineName, answer.wineName, CORE_V3_FIELD_POINTS.wineName);

  const actualAppellation = (answer.appellation ?? "").trim();
  const appellationApplicable = actualAppellation.length > 0;
  const appellationCorrect = appellationApplicable
    ? isNormalizedMatch(guess.appellation, actualAppellation)
    : null;

  const countryPoints = countryCorrect ? CORE_V3_FIELD_POINTS.country : 0;
  const regionPoints = regionCorrect ? CORE_V3_FIELD_POINTS.region : 0;
  const appellationPoints = appellationApplicable && appellationCorrect ? CORE_V3_FIELD_POINTS.appellation : 0;
  const appellationPossiblePoints: 0 | 20 = appellationApplicable ? CORE_V3_FIELD_POINTS.appellation : 0;

  const corePossiblePoints: 120 | 140 = appellationApplicable ? 140 : 120;
  const corePoints =
    countryPoints +
    regionPoints +
    appellationPoints +
    grapeBlendScore.points +
    vintageScore.points +
    producerScore.points +
    wineNameScore.points;

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
    grapeBlendPoints: grapeBlendScore.points,
    grapeBlendPossiblePoints: 20,
    vintageCorrect: vintageScore.correct,
    vintagePoints: vintageScore.points,
    vintagePossiblePoints: 20,
    producerCorrect: producerScore.correct,
    producerPoints: producerScore.points,
    producerPossiblePoints: 20,
    wineNameCorrect: wineNameScore.correct,
    wineNamePoints: wineNameScore.points,
    wineNamePossiblePoints: 20,
    corePoints,
    corePossiblePoints,
    totalPoints: corePoints,
    totalPossiblePoints: corePossiblePoints,
  };
}

/**
 * core_v4_partial_credit ONLY — wraps calculateBlindScoreV4 into the shared
 * ScoredGuess shape, structured identically to scoreWineGuessCoreV3 (full,
 * independent copy — see calculateBlindScoreV4's doc comment for why).
 */
export function scoreWineGuessCoreV4(
  guestId: string,
  guestName: string,
  guess: WineGuess,
  answer: WineAnswerKey
): ScoredGuess {
  const blind = calculateBlindScoreV4(guess, answer);
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
    {
      field: "producer",
      category: "core",
      guessedValue: guess.producer.trim() || "—",
      answerValue: answer.producer || "—",
      correct: blind.producerCorrect,
      points: blind.producerPoints,
      pointsAvailable: blind.producerPossiblePoints,
    },
    {
      field: "wineName",
      category: "core",
      guessedValue: guess.wineName.trim() || "—",
      answerValue: answer.wineName || "—",
      correct: blind.wineNameCorrect,
      points: blind.wineNamePoints,
      pointsAvailable: blind.wineNamePossiblePoints,
    },
  ];

  return {
    guestId,
    guestName,
    wineId: guess.wineId,
    fieldScores,
    appellationGuess: undefined,
    scoringVersion: "core_v4_partial_credit",
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
    note: guess.note ?? null,
  };
}

/**
 * Scores one guest's full guess for one wine against its answer key, under
 * the given session's scoring version. This is the only entry point the rest
 * of the app (lib/results.ts, lib/supabase/mappers.ts) should call — it
 * keeps each scoring model's math completely isolated in its own named
 * function above rather than branching inline. A true exhaustive switch (not
 * a boolean widen) — country/region/appellation aside, v3 and v4 have
 * genuinely different field-level math, so this is the one dispatcher in the
 * app that must stay a real per-version fork.
 */
export function scoreWineGuess(
  guestId: string,
  guestName: string,
  guess: WineGuess,
  answer: WineAnswerKey,
  scoringVersion: ScoringVersion
): ScoredGuess {
  switch (scoringVersion) {
    case "legacy_v1":
      return scoreWineGuessLegacyV1(guestId, guestName, guess, answer);
    case "core_v3_appellation_conditional":
      return scoreWineGuessCoreV3(guestId, guestName, guess, answer);
    case "core_v4_partial_credit":
      return scoreWineGuessCoreV4(guestId, guestName, guess, answer);
  }
}
