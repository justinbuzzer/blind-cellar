import Link from "next/link";
import { RankedCount, RankedRating, RevisitedWine, StandoutBottle, TastingScope, WineRecord } from "@/lib/profile";
import { WINE_STYLE_LABELS } from "@/types/tasting";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function RankedCountColumn({ title, items, unit }: { title: string; items: RankedCount[]; unit: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-cellar-gold">{title}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-cellar-text">{item.label}</span>
            <span className="whitespace-nowrap text-cellar-muted">
              {item.count} {item.count === 1 ? unit : `${unit}s`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RankedRatingColumn({ title, items }: { title: string; items: RankedRating[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-cellar-gold">{title}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-cellar-text">{item.label}</span>
            <span className="whitespace-nowrap text-cellar-muted">
              {item.averageRating.toFixed(1)} avg · {item.count} rated
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StandoutBottleRow({ bottle }: { bottle: StandoutBottle }) {
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-cellar-text">
          {bottle.wine.producer} — {bottle.wine.wineName} {bottle.wine.vintage}
        </p>
        <p className="text-sm font-semibold text-cellar-maroon-dark">{bottle.personalRating}</p>
      </div>
      <p className="text-xs text-cellar-muted">
        {bottle.wine.region}, {bottle.wine.country} · {WINE_STYLE_LABELS[bottle.wine.wineStyle]} ·{" "}
        {formatDate(bottle.tastingDate)}
      </p>
      <Link
        href={`/results/${bottle.publicId}?from=account`}
        className="inline-flex min-h-[44px] w-fit items-center text-xs font-medium text-cellar-maroon underline-offset-4 hover:text-cellar-maroon-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
      >
        View report <span aria-hidden="true">→</span>
      </Link>
    </li>
  );
}

function RevisitedWineRow({ wine }: { wine: RevisitedWine }) {
  const hasSpread = wine.minRating !== null && wine.maxRating !== null && wine.minRating !== wine.maxRating;
  return (
    <li className="flex flex-col gap-1 py-3">
      <p className="text-sm font-medium text-cellar-text">
        {wine.wine.producer} — {wine.wine.wineName} {wine.wine.vintage}
      </p>
      <p className="text-xs text-cellar-muted">
        {wine.occasions} occasions · {formatDate(wine.firstTastedDate)} to {formatDate(wine.lastTastedDate)}
        {wine.averageRating !== null && ` · ${wine.averageRating.toFixed(1)} avg`}
        {hasSpread ? ` (${wine.minRating}–${wine.maxRating})` : ""}
      </p>
    </li>
  );
}

/** See README "Palate Profile" — "Your wine record". Scope-sensitive: the parent page must recompute this whenever the scope toggle changes. */
export function WineRecordSection({ data, scope }: { data: WineRecord; scope: TastingScope }) {
  const hasExplored =
    data.mostExploredCountries.length > 0 ||
    data.mostExploredRegions.length > 0 ||
    data.mostExploredGrapes.length > 0 ||
    data.mostExploredStyles.length > 0;
  const hasHighestRated =
    data.highestRatedCountries.length > 0 ||
    data.highestRatedRegions.length > 0 ||
    data.highestRatedGrapes.length > 0 ||
    data.highestRatedStyles.length > 0;
  const hasFamiliar = data.familiarProducers.length > 0 || data.familiarWines.length > 0;

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-2xl font-semibold text-cellar-maroon-dark">Your wine record</h2>
        <p className="mt-2 text-sm text-cellar-muted">
          {scope === "blind_only"
            ? "Drawn from wines tasted blind or revealed course by course."
            : "Drawn from all included tastings, including Seen tastings."}
        </p>
      </div>

      {hasExplored && (
        <div>
          <h3 className="font-display text-lg font-semibold text-cellar-maroon-dark">Most explored</h3>
          <div className="mt-3 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <RankedCountColumn title="Countries" items={data.mostExploredCountries} unit="wine" />
            <RankedCountColumn title="Regions" items={data.mostExploredRegions} unit="wine" />
            <RankedCountColumn title="Grapes / blends" items={data.mostExploredGrapes} unit="wine" />
            <RankedCountColumn title="Styles" items={data.mostExploredStyles} unit="wine" />
          </div>
        </div>
      )}

      {hasHighestRated && (
        <div>
          <h3 className="font-display text-lg font-semibold text-cellar-maroon-dark">Highest rated</h3>
          <div className="mt-3 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <RankedRatingColumn title="Countries" items={data.highestRatedCountries} />
            <RankedRatingColumn title="Regions" items={data.highestRatedRegions} />
            <RankedRatingColumn title="Grapes / blends" items={data.highestRatedGrapes} />
            <RankedRatingColumn title="Styles" items={data.highestRatedStyles} />
          </div>
        </div>
      )}

      {hasFamiliar && (
        <div>
          <h3 className="font-display text-lg font-semibold text-cellar-maroon-dark">Familiar ground</h3>
          <div className="mt-3 grid gap-6 sm:grid-cols-2">
            <RankedCountColumn title="Producers" items={data.familiarProducers} unit="visit" />
            <RankedCountColumn title="Wines / cuvées" items={data.familiarWines} unit="visit" />
          </div>
        </div>
      )}

      <div>
        <h3 className="font-display text-lg font-semibold text-cellar-maroon-dark">Standout bottles</h3>
        {data.standoutBottles.length === 0 ? (
          <p className="mt-2 text-sm text-cellar-muted">
            Your standout bottles will appear as you record more ratings.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-cellar-border">
            {data.standoutBottles.map((bottle, index) => (
              <StandoutBottleRow key={`${bottle.publicId}-${index}`} bottle={bottle} />
            ))}
          </ul>
        )}
      </div>

      {data.mostRevisited.length > 0 && (
        <div>
          <h3 className="font-display text-lg font-semibold text-cellar-maroon-dark">Most revisited</h3>
          <ul className="mt-3 divide-y divide-cellar-border">
            {data.mostRevisited.map((wine) => (
              <RevisitedWineRow key={wine.identityKey} wine={wine} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
