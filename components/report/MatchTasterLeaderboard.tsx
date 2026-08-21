import { MatchTasterResult } from "@/types/tasting";
import { Card } from "@/components/Card";

interface MatchTasterLeaderboardProps {
  results: MatchTasterResult[];
}

/**
 * Blind match's taster leaderboard — a plain correct-count ranking, not the
 * field-by-field points TasterLeaderboard.tsx renders for full_blind/
 * course_reveal. Seen has no equivalent of this component at all (no
 * correctness to rank by).
 */
export function MatchTasterLeaderboard({ results }: MatchTasterLeaderboardProps) {
  if (results.length === 0) {
    return (
      <Card className="text-center text-sm text-cellar-muted">
        No guests participated in this tasting.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {results.map((taster) => (
        <Card key={taster.guestId} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-6 shrink-0 font-display text-lg text-cellar-muted">{taster.rank}</span>
            <p className="font-medium text-cellar-text">{taster.guestName}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-lg font-semibold text-cellar-maroon-dark">
              {taster.correctCount} of {taster.totalBottles} correct
            </p>
            <p className="text-xs text-cellar-muted">{taster.accuracyPercent}% accuracy</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
