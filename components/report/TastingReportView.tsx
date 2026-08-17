import { TastingReport } from "@/types/tasting";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { ImageBand } from "@/components/ImageBand";
import { resultsImage } from "@/lib/appImages";
import { Highlight } from "./Highlight";
import { WineResultCard } from "./WineResultCard";
import { TasterLeaderboard } from "./TasterLeaderboard";

interface TastingReportViewProps {
  report: TastingReport;
  /** See WineResultCard's `showNotes` — false (host view, unchanged) unless the caller is an authorized participant viewing the completed shared report. */
  showNotes?: boolean;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function TastingReportView({ report, showNotes = false }: TastingReportViewProps) {
  const { wineOfTheNight, bestTaster, mostDivisiveWine, wineResults, tasterResults } =
    report;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {wineOfTheNight.length > 0 && (
          <Highlight
            label="Wine of the Night"
            title={joinNames(wineOfTheNight.map((w) => w.wine.code))}
            detail={`Avg rating ${wineOfTheNight[0].averageRating}`}
            tie={wineOfTheNight.length > 1}
          />
        )}
        {bestTaster.length > 0 && (
          <Highlight
            label="Best Taster"
            title={joinNames(bestTaster.map((t) => t.guestName))}
            detail={
              report.scoringVersion !== "legacy_v1"
                ? `${bestTaster[0].overallAccuracyPercent.toFixed(1)}% accuracy · ${bestTaster[0].totalPoints} / ${bestTaster[0].totalPossible} points`
                : `${bestTaster[0].totalPoints} / ${bestTaster[0].totalPossible} total points, including ${bestTaster[0].bonusPoints} bonus points`
            }
            tie={bestTaster.length > 1}
          />
        )}
        {mostDivisiveWine.length > 0 && mostDivisiveWine[0].ratingSpread ? (
          <Highlight
            label="Most Divisive Wine"
            title={joinNames(mostDivisiveWine.map((w) => w.wine.code))}
            detail={`Spread of ${mostDivisiveWine[0].ratingSpread} points`}
            tie={mostDivisiveWine.length > 1}
          />
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <SectionEyebrow>The tasting ledger</SectionEyebrow>
        <div className="flex flex-col gap-4">
          {wineResults.map((result, index) => (
            <WineResultCard
              key={result.wine.id}
              result={result}
              rank={index + 1}
              totalWines={wineResults.length}
              showNotes={showNotes}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionEyebrow>Taster leaderboard</SectionEyebrow>
        <TasterLeaderboard results={tasterResults} scoringVersion={report.scoringVersion} />
      </section>

      <ImageBand image={resultsImage} className="hidden h-48 rounded-sm sm:block" />
    </div>
  );
}
