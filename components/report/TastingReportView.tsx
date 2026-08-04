import { TastingReport } from "@/types/tasting";
import { Highlight } from "./Highlight";
import { WineResultCard } from "./WineResultCard";
import { TasterLeaderboard } from "./TasterLeaderboard";

interface TastingReportViewProps {
  report: TastingReport;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function TastingReportView({ report }: TastingReportViewProps) {
  const { wineOfTheNight, bestTaster, mostDivisiveWine, wineResults, tasterResults } =
    report;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {wineOfTheNight.length > 0 && (
          <Highlight
            label="Wine of the Night"
            icon="🏆"
            title={joinNames(wineOfTheNight.map((w) => w.wine.code))}
            detail={`Avg rating ${wineOfTheNight[0].averageRating}`}
            tie={wineOfTheNight.length > 1}
          />
        )}
        {bestTaster.length > 0 && (
          <Highlight
            label="Best Taster"
            icon="👃"
            title={joinNames(bestTaster.map((t) => t.guestName))}
            detail={`${bestTaster[0].totalPoints} / ${bestTaster[0].totalPossible} total points, including ${bestTaster[0].bonusPoints} bonus points`}
            tie={bestTaster.length > 1}
          />
        )}
        {mostDivisiveWine.length > 0 && mostDivisiveWine[0].ratingSpread ? (
          <Highlight
            label="Most Divisive Wine"
            icon="⚡"
            title={joinNames(mostDivisiveWine.map((w) => w.wine.code))}
            detail={`Spread of ${mostDivisiveWine[0].ratingSpread} points`}
            tie={mostDivisiveWine.length > 1}
          />
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-cellar-maroon-dark">
          Wine results
        </h2>
        <div className="flex flex-col gap-4">
          {wineResults.map((result, index) => (
            <WineResultCard
              key={result.wine.id}
              result={result}
              rank={index + 1}
              totalWines={wineResults.length}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-cellar-maroon-dark">
          Taster leaderboard
        </h2>
        <TasterLeaderboard results={tasterResults} />
      </section>
    </div>
  );
}
