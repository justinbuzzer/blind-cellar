import { WineAnswerKey } from "@/types/tasting";
import { compactWineLocationLabel } from "@/lib/appellations";

/**
 * The actual-wine identity block shown once a bottle is revealed — see
 * README "Results reveal". Editorial hierarchy per spec: Producer — Wine/
 * cuvée; Vintage (or "NV"); Appellation, Region, Country; Grape or blend.
 * Shared by the host and participant per-bottle result pages so the two
 * never drift. Never invents a value — a missing field is simply omitted
 * from the location/grape line rather than shown as a placeholder.
 */
export function RevealedWineIdentity({ wine }: { wine: WineAnswerKey }) {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-cellar-maroon-dark sm:text-4xl">
        {wine.producer} — {wine.wineName}
      </h1>
      <p className="mt-1 text-lg text-cellar-muted">{wine.vintage || "NV"}</p>
      <p className="mt-1 text-sm text-cellar-muted">
        {[compactWineLocationLabel(wine), wine.grapeBlend].filter(Boolean).join(" · ")}
      </p>
      {wine.contributorName && (
        <p className="mt-1 text-sm text-cellar-muted">
          Contributed by <span className="font-medium text-cellar-text">{wine.contributorName}</span>
        </p>
      )}
    </div>
  );
}
