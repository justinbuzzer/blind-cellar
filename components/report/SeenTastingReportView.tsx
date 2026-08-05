import { SeenTastingReport } from "@/types/tasting";
import { Card } from "@/components/Card";
import { Stat } from "@/components/Stat";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { ImageBand } from "@/components/ImageBand";
import { resultsImage } from "@/lib/appImages";
import { Highlight } from "./Highlight";
import { SeenBottleResultCard } from "./SeenBottleResultCard";

interface SeenTastingReportViewProps {
  report: SeenTastingReport;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/**
 * Seen tasting's results view — rating-focused, not guessing-focused. No
 * Best Taster, no identification scoring, no leaderboard: see README
 * "Tasting modes" for why this is a deliberately separate component from
 * TastingReportView rather than a conditional branch inside it.
 */
export function SeenTastingReportView({ report }: SeenTastingReportViewProps) {
  const { wineOfTheNight, mostDivisiveWine, bottleResults, totalRatings, totalRaters, totalBottles } =
    report;

  return (
    <div className="flex flex-col gap-8">
      <ImageBand image={resultsImage} className="hidden h-40 rounded-sm sm:block" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {wineOfTheNight.length > 0 && wineOfTheNight[0].averageRating !== null && (
          <Highlight
            label="Wine of the Night"
            title={joinNames(wineOfTheNight.map((w) => w.wine.code))}
            detail={`Avg rating ${wineOfTheNight[0].averageRating}`}
            tie={wineOfTheNight.length > 1}
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

      <Card className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Bottles" value={totalBottles} />
        <Stat label="Raters" value={totalRaters} />
        <Stat label="Ratings" value={totalRatings} />
      </Card>

      <section className="flex flex-col gap-3">
        <SectionEyebrow>Wine ranking</SectionEyebrow>
        <div className="flex flex-col gap-4">
          {bottleResults.map((result) => (
            <SeenBottleResultCard
              key={result.wine.id}
              result={result}
              totalWines={bottleResults.length}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
