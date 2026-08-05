import { SeenBottleResult, WINE_STYLE_LABELS } from "@/types/tasting";
import { Card } from "@/components/Card";
import { Stat } from "@/components/Stat";

interface SeenBottleResultCardProps {
  result: SeenBottleResult;
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

/**
 * Seen tasting's rating-only equivalent of WineResultCard — no scoring, no
 * per-guess field breakdown, just each bottle's rating stats and every
 * participant's rating (or explicit "No rating" — never fabricated).
 */
export function SeenBottleResultCard({ result, totalWines }: SeenBottleResultCardProps) {
  const { wine } = result;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-gold">
          #{result.rank} · {wine.code}
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
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-sm bg-cellar-bg-deep p-3 text-center sm:grid-cols-5">
        <Stat label="Average" value={result.averageRating ?? "—"} />
        <Stat label="Ratings" value={result.numRatings} />
        <Stat label="Lowest" value={result.lowestRating ?? "—"} />
        <Stat label="Highest" value={result.highestRating ?? "—"} />
        <Stat label="Spread" value={result.ratingSpread ?? "—"} />
      </div>

      <details className="rounded-sm border border-cellar-border">
        <summary className="cursor-pointer list-none rounded-sm px-3 py-2 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
          Everyone&rsquo;s ratings
        </summary>
        <ul className="flex flex-col border-t border-cellar-border px-3 py-1">
          {result.participantRatings.map((p) => (
            <li
              key={p.guestId}
              className="flex flex-col gap-0.5 border-b border-cellar-border/50 py-2 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-cellar-text">{p.guestName}</span>
                <span
                  className={
                    p.rating !== null
                      ? "font-medium text-cellar-maroon"
                      : "text-cellar-muted"
                  }
                >
                  {p.rating !== null ? p.rating : "No rating"}
                </span>
              </div>
              {p.note && (
                <p className="text-xs italic text-cellar-muted">&ldquo;{p.note}&rdquo;</p>
              )}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
