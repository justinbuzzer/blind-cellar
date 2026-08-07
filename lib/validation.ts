import { WineIdentityErrors } from "@/components/registration/WineIdentityFields";
import { combineBlendComponents, isKnownCountry, isValidRegionForCountry } from "@/lib/wineReferenceData";
import { isValidAppellation } from "@/lib/appellations";
import { TASTING_MODES, TastingMode, WineGuess, WineIdentityInput } from "@/types/tasting";

/** Type guard for the `tastingMode` field submitted from session creation. */
export function isValidTastingMode(value: string): value is TastingMode {
  return (TASTING_MODES as string[]).includes(value);
}

const FOUR_DIGIT_YEAR = /^\d{4}$/;

/** Shared with guess-entry's final-submit check, so the guidance is worded identically everywhere it appears. */
export const BLEND_MIN_GRAPES_MESSAGE =
  "Select at least two grapes for a blend, or choose Single variety instead.";

/** A bottle's vintage must be a plausible four-digit year, or "NV" (non-vintage). */
export function isValidVintage(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.toUpperCase() === "NV") return true;
  if (!FOUR_DIGIT_YEAR.test(trimmed)) return false;
  const year = Number(trimmed);
  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear + 1;
}

/**
 * Validates the wine-identity fields shared by the tasting bottle form and
 * the Personal Cellar bottle form (see README "Personal Cellar") — takes the
 * common `WineIdentityInput` shape so both `BottleFormInput` and
 * `CellarBottleFormInput` (each a superset) can reuse it unchanged, keeping
 * their validation rules identical by construction rather than by
 * convention.
 */
export function validateBottleForm(input: WineIdentityInput): WineIdentityErrors {
  const errors: WineIdentityErrors = {};

  if (!input.country.trim() || !isKnownCountry(input.country)) {
    errors.country = "Select a country.";
  }
  if (
    !input.region.trim() ||
    !input.country.trim() ||
    !isValidRegionForCountry(input.country, input.region)
  ) {
    errors.region = "Select a region.";
  }
  if (!input.grapeBlendMode) {
    errors.grapeBlendMode = "Choose single variety or blend.";
  } else if (input.grapeBlendMode === "single") {
    if (!input.grapeBlend.trim()) {
      errors.grapeBlend = "Select a grape variety.";
    }
  } else {
    const components = combineBlendComponents(input.selectedGrapes, input.otherGrapesText);
    if (components.length < 2) {
      errors.grapeBlend = BLEND_MIN_GRAPES_MESSAGE;
    }
  }
  if (input.appellation.trim() && !isValidAppellation(input.country, input.region, input.appellation)) {
    errors.appellation = "Select an appellation from the available options.";
  }
  if (!input.producer.trim()) errors.producer = "Producer is required.";
  if (!input.wineName.trim()) errors.wineName = "Wine / cuvée is required.";
  if (!input.vintage.trim()) {
    errors.vintage = "Vintage is required.";
  } else if (!isValidVintage(input.vintage)) {
    errors.vintage = "Enter a valid four-digit year, or “NV”.";
  }
  if (!input.wineStyle) {
    errors.wineStyle = "Choose a wine style.";
  }

  return errors;
}

/** Generic over any bottle-shaped error object (tasting or cellar) — only ever checks for the presence of a key. */
export function hasBottleFormErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Guess entry stays optional/incomplete-friendly for autosave (a blank
 * grape/blend guess earns zero points, not a validation error) — but a
 * blend guess with exactly one grape selected is a likely mis-click rather
 * than an intentional guess, so it's blocked at final submit, same as a
 * missing rating. Zero grapes (blank) and two-or-more are both fine.
 */
export function hasIncompleteBlend(guess: WineGuess): boolean {
  if (guess.grapeBlendMode !== "blend") return false;
  const components = combineBlendComponents(guess.selectedGrapes, guess.otherGrapesText);
  return components.length === 1;
}
