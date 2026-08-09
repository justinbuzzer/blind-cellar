import { ScoredGuess, WineAnswerKey } from "@/types/tasting";
import { Card } from "@/components/Card";
import {
  AppellationComparison,
  FieldScoreTable,
  PersonalPrecisionComparison,
} from "@/components/report/WineResultCard";

interface ParticipantScoreBreakdownProps {
  wine: WineAnswerKey;
  /** Null when the participant has no submitted guess for this bottle. */
  score: ScoredGuess | null;
}

/**
 * A single participant's own field-by-field score breakdown for one
 * revealed bottle — see README "Results reveal". Reuses the exact same
 * `FieldScoreTable`/comparison components the final report and the
 * course_reveal per-bottle reveal screen already use, so no score
 * formatting is duplicated across those three surfaces. Never shown with
 * another participant's data — the caller is responsible for only ever
 * passing the viewer's own `score`.
 */
export function ParticipantScoreBreakdown({ wine, score }: ParticipantScoreBreakdownProps) {
  if (!score) {
    return (
      <Card className="text-sm text-cellar-muted">No submitted guess for this bottle.</Card>
    );
  }

  const isCoreV3 = score.scoringVersion === "core_v3_appellation_conditional";
  const coreFields = score.fieldScores.filter((f) => f.category === "core");
  const bonusFields = score.fieldScores.filter((f) => f.category === "bonus");

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-cellar-muted">Your score</p>
        <p className="mt-1 font-display text-2xl font-semibold text-cellar-maroon-dark">
          {score.totalPoints} / {score.totalPossiblePoints}
        </p>
      </div>
      <FieldScoreTable heading="Score breakdown" fields={coreFields} />
      {!isCoreV3 && (
        <AppellationComparison
          guessedAppellation={score.appellationGuess}
          actualAppellation={wine.appellation}
        />
      )}
      {!isCoreV3 && <FieldScoreTable heading="Bonus categories" fields={bonusFields} />}
      {isCoreV3 && (
        <PersonalPrecisionComparison
          producerGuess={score.producerGuess}
          producerAnswer={wine.producer}
          wineCuveeGuess={score.wineCuveeGuess}
          wineCuveeAnswer={wine.wineName}
        />
      )}
    </Card>
  );
}
