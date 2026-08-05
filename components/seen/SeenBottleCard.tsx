import Link from "next/link";
import { Button } from "@/components/Button";
import { SeenBottleDTO } from "@/lib/supabase/types";
import { WINE_STYLE_LABELS } from "@/types/tasting";

interface SeenBottleCardProps {
  publicId: string;
  bottle: SeenBottleDTO;
}

/**
 * One row in the seen-tasting list (see README "Tasting modes") — a plain
 * tasting-list row, not a catalogue card. Rated vs. unrated status is never
 * colour-only — the icon, the text label, and the action button label
 * ("Rate bottle" vs "Edit rating") all change together.
 */
export function SeenBottleCard({ publicId, bottle }: SeenBottleCardProps) {
  const rated = bottle.myRating !== null;

  return (
    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-gold">
          {bottle.anonymousCode} · {bottle.position} of {bottle.totalBottles}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold text-cellar-maroon-dark">
          {bottle.producer} — {bottle.wineCuvee} {bottle.vintage}
        </h3>
        <p className="mt-1 text-sm text-cellar-muted">
          {[bottle.country, bottle.region, bottle.grapeBlend].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-sm text-cellar-muted">
          Style: {WINE_STYLE_LABELS[bottle.wineStyle]}
          {bottle.contributorName && (
            <>
              {" "}
              · Contributed by{" "}
              <span className="font-medium text-cellar-text">{bottle.contributorName}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start sm:gap-2">
        <p
          className={`flex items-center gap-1.5 text-sm font-medium ${
            rated ? "text-cellar-maroon" : "text-cellar-muted"
          }`}
        >
          <span aria-hidden="true">{rated ? "✓" : "○"}</span>
          {rated ? `Rated: ${bottle.myRating}` : "Not yet rated"}
        </p>
        <Link href={`/session/${publicId}/seen/${bottle.id}`}>
          <Button variant={rated ? "secondary" : "primary"}>
            {rated ? "Edit rating" : "Rate bottle"}
          </Button>
        </Link>
      </div>
    </div>
  );
}
