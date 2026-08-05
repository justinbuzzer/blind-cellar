import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SeenBottleDTO } from "@/lib/supabase/types";
import { WINE_STYLE_LABELS } from "@/types/tasting";

interface SeenBottleCardProps {
  publicId: string;
  bottle: SeenBottleDTO;
}

/**
 * One bottle in the seen-tasting list (see README "Tasting modes"). Rated
 * vs. unrated status is never colour-only — the icon, the text label, and
 * the action button label ("Rate bottle" vs "Edit rating") all change
 * together.
 */
export function SeenBottleCard({ publicId, bottle }: SeenBottleCardProps) {
  const rated = bottle.myRating !== null;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-cellar-gold">
          {bottle.anonymousCode} · {bottle.position} of {bottle.totalBottles}
        </p>
        <h3 className="text-base font-semibold text-cellar-maroon-dark">
          {bottle.producer} — {bottle.wineCuvee} {bottle.vintage}
        </h3>
        <p className="text-sm text-cellar-text/70">
          {[bottle.country, bottle.region, bottle.grapeBlend].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-sm text-cellar-text/70">
          Style: {WINE_STYLE_LABELS[bottle.wineStyle]}
        </p>
        {bottle.contributorName && (
          <p className="mt-1 text-sm text-cellar-text/70">
            Contributed by <span className="font-medium">{bottle.contributorName}</span>
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-cellar-border pt-3">
        <p
          className={`flex items-center gap-1.5 text-sm font-medium ${
            rated ? "text-cellar-maroon" : "text-cellar-text/50"
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
    </Card>
  );
}
