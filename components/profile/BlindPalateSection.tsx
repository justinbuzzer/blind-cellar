import { BlindPalate, CategoryAccuracy } from "@/lib/profile";
import { MetricStrip } from "./MetricStrip";

function AccuracyRow({ category }: { category: CategoryAccuracy }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium text-cellar-text">{category.label}</p>
        <p className="text-xs text-cellar-muted">
          {category.submitted > 0
            ? `${category.correct} correct from ${category.submitted} submitted calls`
            : "No submitted calls yet"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-cellar-border sm:block" aria-hidden="true">
          <div className="h-full bg-cellar-maroon" style={{ width: `${category.accuracyPercent ?? 0}%` }} />
        </div>
        <p className="w-12 shrink-0 text-right text-sm font-medium text-cellar-maroon-dark">
          {category.accuracyPercent !== null ? `${category.accuracyPercent}%` : "—"}
        </p>
      </div>
    </div>
  );
}

/**
 * See README "Palate Profile" — "Blind palate". Always Full blind +
 * Course-by-course only, independent of the Seen scope toggle — the parent
 * page must pass data computed from extractBlindObservations, never the
 * scope-filtered observation set. Spans both scoring versions (see README
 * "Scoring model") — "Blind accuracy" and the raw points basis are computed
 * from each guess's own possible-points denominator, so a blend of
 * legacy_v1 and core_v3_appellation_conditional sessions is never
 * misleading. There is no bonus category or Producer/Wine-cuvée hit rate
 * under the current model, so neither appears here.
 */
export function BlindPalateSection({ data }: { data: BlindPalate }) {
  if (data.totalSubmittedCalls === 0) {
    return (
      <section>
        <h2 className="font-display text-2xl font-semibold text-cellar-maroon-dark">Blind palate</h2>
        <p className="mt-2 text-sm text-cellar-muted">
          Based on Full blind and Course-by-course tastings where you submitted a guess.
        </p>
        <p className="mt-4 text-sm text-cellar-muted">
          Your blind record will take shape after your first completed blind tasting.
        </p>
      </section>
    );
  }

  const { strengths } = data;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-2xl font-semibold text-cellar-maroon-dark">Blind palate</h2>
        <p className="mt-2 text-sm text-cellar-muted">
          Based on Full blind and Course-by-course tastings where you submitted a guess.
        </p>
      </div>

      <MetricStrip
        figures={[
          {
            label: "Blind accuracy",
            value: data.blindAccuracyPercent !== null ? `${data.blindAccuracyPercent}%` : "—",
          },
          { label: "Blind wine calls submitted", value: String(data.totalSubmittedCalls) },
          {
            label: "Points earned / possible",
            value: `${data.pointsEarned} points from ${data.pointsPossible} possible`,
          },
        ]}
      />

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-cellar-gold">Category calls</p>
        <div className="mt-1 divide-y divide-cellar-border">
          {data.categories.map((category) => (
            <AccuracyRow key={category.field} category={category} />
          ))}
        </div>
      </div>

      <div>
        {strengths.hasSufficientSample ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            {strengths.strongestCategory && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.1em] text-cellar-gold">
                  Most confident call
                </dt>
                <dd className="mt-1 text-sm text-cellar-text">
                  {strengths.strongestCategory.label} ({strengths.strongestCategory.accuracyPercent}%)
                </dd>
              </div>
            )}
            {strengths.developingCategory && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.1em] text-cellar-gold">Area to explore</dt>
                <dd className="mt-1 text-sm text-cellar-text">
                  {strengths.developingCategory.label} ({strengths.developingCategory.accuracyPercent}%)
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-cellar-muted">
            More completed blind calls will reveal patterns in your palate.
          </p>
        )}
      </div>
    </section>
  );
}
