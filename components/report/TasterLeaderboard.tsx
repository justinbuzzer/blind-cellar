import { TasterResult } from "@/types/tasting";
import { Card } from "@/components/Card";
import { Stat } from "@/components/Stat";

interface TasterLeaderboardProps {
  results: TasterResult[];
}

export function TasterLeaderboard({ results }: TasterLeaderboardProps) {
  if (results.length === 0) {
    return (
      <Card className="text-center text-sm text-cellar-text/60">
        No guests submitted entries for this tasting.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-cellar-text/60">
        Country, region, grape/blend, and vintage make up the 100-point core
        score. Producer and wine/cuvée are bonus categories worth up to 20
        additional points.
      </p>
      {results.map((taster) => (
        <Card key={taster.guestId} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cellar-maroon text-sm font-semibold text-white">
                {taster.rank}
              </span>
              <p className="font-medium text-cellar-text">{taster.guestName}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-cellar-maroon-dark">
                {taster.totalPoints}/{taster.totalPossible}
              </p>
              <p className="text-xs text-cellar-text/60">Total score</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-cellar-bg p-3 text-center sm:grid-cols-4">
            <Stat
              label="Core score"
              value={`${taster.corePoints}/${taster.corePossible}`}
            />
            <Stat
              label="Bonus score"
              value={`${taster.bonusPoints}/${taster.bonusPossible}`}
            />
            <Stat
              label="Overall accuracy"
              value={`${taster.overallAccuracyPercent.toFixed(1)}%`}
            />
            <Stat
              label="Core accuracy"
              value={`${taster.coreAccuracyPercent.toFixed(1)}%`}
            />
          </div>
          <p className="text-xs text-cellar-text/60">
            {taster.exactCoreMatches} exact core calls · avg rating{" "}
            {taster.averageRatingGiven ?? "—"}
          </p>
        </Card>
      ))}
    </div>
  );
}
