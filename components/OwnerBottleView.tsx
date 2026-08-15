import { SectionEyebrow } from "./SectionEyebrow";

interface OwnerBottleViewProps {
  /** The same safe blind-bottle label (e.g. "Bottle 2 — Ava") used in the guess form's own heading — see lib/codes.ts formatBlindBottleLabel. Never the actual wine identity. */
  wineLabel: string;
}

/**
 * Shown instead of WineGuessForm when the current participant is this
 * bottle's own canonical contributor — see README "Own-bottle guessing
 * exclusion". A contributor already knows their own bottle, so they are
 * never asked to guess or scored on it; this replaces the guess form
 * entirely rather than merely disabling it, matching the existing
 * quiet/editorial waiting-screen style already used elsewhere in the
 * guessing flows (no large banner, no dashboard treatment, no celebratory
 * copy).
 */
export function OwnerBottleView({ wineLabel }: OwnerBottleViewProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-cellar-gold/40 pt-5">
      <SectionEyebrow>{wineLabel}</SectionEyebrow>
      <h2 className="font-display text-2xl font-semibold text-cellar-maroon-dark">
        This is your bottle
      </h2>
      <p className="text-sm text-cellar-muted">
        You do not need to submit a guess for it.
      </p>
    </div>
  );
}
