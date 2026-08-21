import { MatchBottleResult, WINE_STYLE_LABELS } from "@/types/tasting";
import { compactWineLocationLabel } from "@/lib/appellations";
import { Card } from "@/components/Card";
import { Stat } from "@/components/Stat";
import { BottlePhoto } from "@/components/BottlePhoto";
import { ContributorLine } from "./ContributorLine";

interface MatchBottleResultCardProps {
  result: MatchBottleResult;
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
 * Blind match's per-bottle result card — same photo/identity header and
 * rating stat grid as SeenBottleResultCard, plus who picked what: a plain
 * 1/0 correctness mark per participant, never a field-by-field breakdown.
 */
export function MatchBottleResultCard({ result, totalWines }: MatchBottleResultCardProps) {
  const { wine } = result;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <BottlePhoto photoPath={wine.photoPath} alt={`${wine.producer} — ${wine.wineName}`} size={72} />
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-gold">
            #{result.rank} · {wine.code}
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-cellar-maroon-dark">
            {wine.producer} — {wine.wineName} {wine.vintage}
          </h3>
          <p className="mt-1 text-sm text-cellar-muted">
            {[compactWineLocationLabel(wine), wine.grapeBlend].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-sm text-cellar-muted">
            Style: {WINE_STYLE_LABELS[wine.wineStyle]} · Served {ordinal(wine.tastingOrder)}{" "}
            (tasting order {wine.tastingOrder} of {totalWines})
          </p>
          <ContributorLine
            contributorName={wine.contributorName}
            wineStyle={wine.wineStyle}
            contributorStyleSequence={wine.contributorStyleSequence}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-sm bg-cellar-bg-deep p-3 text-center sm:grid-cols-6">
        <Stat label="Matched" value={`${result.correctCount}/${result.totalPicks}`} />
        <Stat label="Average" value={result.averageRating ?? "—"} />
        <Stat label="Ratings" value={result.numRatings} />
        <Stat label="Lowest" value={result.lowestRating ?? "—"} />
        <Stat label="Highest" value={result.highestRating ?? "—"} />
        <Stat label="Spread" value={result.ratingSpread ?? "—"} />
      </div>

      <details className="rounded-sm border border-cellar-border">
        <summary className="cursor-pointer list-none rounded-sm px-3 py-2 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
          Everyone&rsquo;s picks
        </summary>
        <ul className="flex flex-col border-t border-cellar-border px-3 py-1">
          {result.participantPicks.map((p) => (
            <li
              key={p.guestId}
              className="flex flex-col gap-0.5 border-b border-cellar-border/50 py-2 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-cellar-text">{p.guestName}</span>
                {p.pickedWine ? (
                  <span
                    className={`flex items-center gap-1.5 font-medium ${
                      p.correct ? "text-cellar-success" : "text-cellar-danger"
                    }`}
                  >
                    <span aria-hidden="true">{p.correct ? "✓" : "✕"}</span>
                    {p.pickedWine.producer} — {p.pickedWine.wineName} {p.pickedWine.vintage}
                  </span>
                ) : (
                  <span className="text-cellar-muted">No pick</span>
                )}
              </div>
              {p.rating !== null && (
                <p className="text-xs text-cellar-muted">Rated {p.rating}</p>
              )}
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
