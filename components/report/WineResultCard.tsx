import {
  BONUS_MAX_POINTS,
  CORE_MAX_POINTS,
  FieldScore,
  TOTAL_MAX_POINTS_PER_WINE,
  WINE_STYLE_LABELS,
  WineResult,
} from "@/types/tasting";
import { Card } from "@/components/Card";
import { MatchBadge } from "@/components/MatchBadge";
import { Stat } from "@/components/Stat";

const FIELD_LABELS: Record<string, string> = {
  country: "Country",
  region: "Region",
  grapeBlend: "Grape / blend",
  vintage: "Vintage",
  producer: "Producer",
  wineName: "Wine / cuvée",
};

interface WineResultCardProps {
  result: WineResult;
  rank: number;
  totalWines: number;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function WineResultCard({ result, rank, totalWines }: WineResultCardProps) {
  const { wine } = result;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-gold">
          #{rank} · {wine.code}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold text-cellar-maroon-dark">
          {wine.producer} — {wine.wineName} {wine.vintage}
        </h3>
        <p className="mt-1 text-sm text-cellar-muted">
          {[wine.country, wine.region, wine.grapeBlend].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-sm text-cellar-muted">
          Style: {WINE_STYLE_LABELS[wine.wineStyle]} · Served {ordinal(wine.tastingOrder)}{" "}
          (tasting order {wine.tastingOrder} of {totalWines})
        </p>
        {wine.contributorName && (
          <p className="mt-1 text-sm text-cellar-muted">
            Contributed by <span className="font-medium text-cellar-text">{wine.contributorName}</span>
          </p>
        )}
        {wine.hostNotes && (
          <p className="mt-1 text-sm italic text-cellar-muted">
            &ldquo;{wine.hostNotes}&rdquo;
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-sm bg-cellar-bg-deep p-3 text-center sm:grid-cols-4">
        <Stat label="Average" value={result.averageRating ?? "—"} />
        <Stat label="Ratings" value={result.numRatings} />
        <Stat label="Lowest" value={result.lowestRating ?? "—"} />
        <Stat label="Highest" value={result.highestRating ?? "—"} />
      </div>

      {result.topTasters.length > 0 && (
        <p className="text-sm text-cellar-text">
          <span className="font-medium text-cellar-maroon">
            Top taster{result.topTasters.length > 1 ? "s" : ""} for this wine:
          </span>{" "}
          {result.topTasters.map((t) => t.guestName).join(", ")} (
          {result.topTasters[0].totalPoints} pts)
        </p>
      )}

      {result.guesses.length === 0 ? (
        <p className="text-sm text-cellar-muted">
          No guesses submitted for this wine.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {result.guesses.map((guess) => {
            const isTopTaster = result.topTasters.some(
              (t) => t.guestId === guess.guestId
            );
            const coreFields = guess.fieldScores.filter((f) => f.category === "core");
            const bonusFields = guess.fieldScores.filter((f) => f.category === "bonus");
            return (
              <details
                key={guess.guestId}
                className="rounded-sm border border-cellar-border"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
                  <span>
                    {guess.guestName}
                    {isTopTaster && (
                      <span className="ml-2 text-xs font-medium uppercase tracking-[0.1em] text-cellar-maroon">
                        Top taster
                      </span>
                    )}
                  </span>
                  <span className="text-cellar-muted">
                    {guess.totalPoints}/{TOTAL_MAX_POINTS_PER_WINE} pts
                    {guess.rating !== null ? ` · rated ${guess.rating}` : ""}
                  </span>
                </summary>
                <div className="flex flex-col gap-4 border-t border-cellar-border px-3 py-3">
                  <FieldScoreTable
                    heading="Core categories"
                    fields={coreFields}
                  />
                  <FieldScoreTable
                    heading="Bonus categories"
                    fields={bonusFields}
                  />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-sm bg-cellar-bg-deep px-3 py-2 text-sm font-medium text-cellar-text">
                    <span>
                      Core: {guess.corePoints}/{CORE_MAX_POINTS}
                    </span>
                    <span>
                      Bonus: {guess.bonusPoints}/{BONUS_MAX_POINTS}
                    </span>
                    <span className="text-cellar-maroon">
                      Total: {guess.totalPoints}/{TOTAL_MAX_POINTS_PER_WINE}
                    </span>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function FieldScoreTable({
  heading,
  fields,
}: {
  heading: string;
  fields: FieldScore[];
}) {
  if (fields.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-cellar-muted">
        {heading}
      </p>
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 text-xs font-semibold uppercase tracking-wide text-cellar-muted">
        <span>Field</span>
        <span>Guess</span>
        <span>Actual</span>
        <span />
      </div>
      {fields.map((fieldScore) => (
        <div
          key={fieldScore.field}
          className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 text-sm"
        >
          <span className="text-cellar-muted">
            {FIELD_LABELS[fieldScore.field]}
          </span>
          <span className="truncate text-cellar-text">
            {fieldScore.guessedValue}
          </span>
          <span className="truncate text-cellar-muted">
            {fieldScore.answerValue}
          </span>
          <MatchBadge correct={fieldScore.correct} />
        </div>
      ))}
    </div>
  );
}
