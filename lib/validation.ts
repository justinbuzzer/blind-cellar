import { BottleFormErrors } from "@/components/registration/BottleForm";
import { BottleFormInput } from "@/lib/supabase/guestActions";
import { isKnownCountry, isValidRegionForCountry } from "@/lib/wineReferenceData";

const FOUR_DIGIT_YEAR = /^\d{4}$/;

/** A bottle's vintage must be a plausible four-digit year, or "NV" (non-vintage). */
export function isValidVintage(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.toUpperCase() === "NV") return true;
  if (!FOUR_DIGIT_YEAR.test(trimmed)) return false;
  const year = Number(trimmed);
  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear + 1;
}

export function validateBottleForm(input: BottleFormInput): BottleFormErrors {
  const errors: BottleFormErrors = {};

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
  } else if (!input.grapeBlend.trim()) {
    errors.grapeBlend =
      input.grapeBlendMode === "single"
        ? "Select a grape variety."
        : "Describe the blend.";
  }
  if (!input.producer.trim()) errors.producer = "Producer is required.";
  if (!input.wineName.trim()) errors.wineName = "Wine / cuvée is required.";
  if (!input.vintage.trim()) {
    errors.vintage = "Vintage is required.";
  } else if (!isValidVintage(input.vintage)) {
    errors.vintage = "Enter a valid four-digit year, or “NV”.";
  }

  return errors;
}

export function hasBottleFormErrors(errors: BottleFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
