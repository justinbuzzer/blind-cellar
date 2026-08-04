import {
  BONUS_FIELD_POINTS,
  BonusScorableField,
  CORE_FIELD_POINTS,
  CORE_MAX_POINTS,
  CoreScorableField,
  FieldScore,
  GrapeBlendMode,
  ScoredGuess,
  TOTAL_MAX_POINTS_PER_WINE,
  WineAnswerKey,
  WineGuess,
} from "@/types/tasting";
import { isNormalizedMatch } from "./normalize";
import { blendTokensFromText, canonicalizeGrapeToken } from "./wineReferenceData";
import { round1 } from "./math";

type CoreTextField = "country" | "region" | "vintage";
type BonusTextField = "producer" | "wineName";

/** Scores a core free-text field. Exact normalised match only. */
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

/** Scores a bonus free-text field (producer, wine/cuvée). Exact normalised match only. */
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
 * Scores the grape/blend core field (30 points).
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
  answerValue: string
): FieldScore {
  const pointsAvailable = CORE_FIELD_POINTS.grapeBlend;
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

/** Scores one guest's full guess for one wine against its answer key. */
export function scoreWineGuess(
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
    corePoints,
    bonusPoints,
    totalPoints,
    coreAccuracyPercent: round1((corePoints / CORE_MAX_POINTS) * 100),
    overallAccuracyPercent: round1((totalPoints / TOTAL_MAX_POINTS_PER_WINE) * 100),
    rating: guess.rating,
    confidence: guess.confidence,
  };
}
