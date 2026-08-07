import { ScoringVersion, TasterResult } from "@/types/tasting";
import { Card } from "@/components/Card";
import { Stat } from "@/components/Stat";

interface TasterLeaderboardProps {
  results: TasterResult[];
  scoringVersion: ScoringVersion;
}

export function TasterLeaderboard({ results, scoringVersion }: TasterLeaderboardProps) {
  const isCoreV3 = scoringVersion === "core_v3_appellation_conditional";

  if (results.length === 0) {
    return (
      <Card className="text-center text-sm text-cellar-muted">
        No guests submitted entries for this tasting.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-cellar-muted">
        {isCoreV3
          ? "Country, region, grape/blend, and vintage are each worth 20 points; Appellation adds 20 more when the wine has one recorded. There is no bonus category — ranking is by percentage accuracy so tasters aren't penalised for bottles with no Appellation to guess."
          : "Country, region, grape/blend, and vintage make up the 100-point core score. Producer and wine/cuvée are bonus categories worth up to 20 additional points."}
      </p>
      {results.map((taster) => (
        <Card key={taster.guestId} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-6 shrink-0 font-display text-lg text-cellar-muted">
                {taster.rank}
              </span>
              <p className="font-medium text-cellar-text">{taster.guestName}</p>
            </div>
            <div className="text-right">
              {isCoreV3 ? (
                <>
                  <p className="font-display text-lg font-semibold text-cellar-maroon-dark">
                    {taster.overallAccuracyPercent.toFixed(1)}%
                  </p>
                  <p className="text-xs text-cellar-muted">
                    {taster.totalPoints} / {taster.totalPossible} points
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-lg font-semibold text-cellar-maroon-dark">
                    {taster.totalPoints}/{taster.totalPossible}
                  </p>
                  <p className="text-xs text-cellar-muted">Total score</p>
                </>
              )}
            </div>
          </div>
          {isCoreV3 ? (
            <div className="grid grid-cols-2 gap-3 rounded-sm bg-cellar-bg-deep p-3 text-center">
              <Stat label="Accuracy" value={`${taster.overallAccuracyPercent.toFixed(1)}%`} />
              <Stat label="Points" value={`${taster.totalPoints} / ${taster.totalPossible}`} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 rounded-sm bg-cellar-bg-deep p-3 text-center sm:grid-cols-4">
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
          )}
          <p className="text-xs text-cellar-muted">
            {taster.exactCoreMatches} exact core calls · avg rating{" "}
            {taster.averageRatingGiven ?? "—"}
          </p>
        </Card>
      ))}
    </div>
  );
}
