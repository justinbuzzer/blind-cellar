import { WineIdentityErrors } from "@/components/registration/WineIdentityFields";
import { CellarBottleRow } from "@/lib/supabase/types";
import { reconstructBlendComponentsFromText } from "@/lib/wineReferenceData";
import { BOTTLE_FORMAT_LABELS, BOTTLE_FORMATS, BottleFormat, WineIdentityInput } from "@/types/tasting";
import { validateBottleForm } from "./validation";

// ---------------------------------------------------------------------------
// Personal Cellar v1 (see README "Personal Cellar"). Pure types/helpers only
// — no Supabase calls here, so form validation and display formatting can be
// unit tested without a live connection, the same philosophy already used
// throughout this codebase (lib/archive.ts, lib/profile.ts, ...).
// ---------------------------------------------------------------------------

export interface CellarBottleFormInput extends WineIdentityInput {
  bottleFormat: BottleFormat;
  /** Required only when bottleFormat === "other" — see validateCellarBottleForm. */
  bottleFormatOther: string;
  storageLocation: string;
  personalNote: string;
}

export type CellarBottleFormErrors = WineIdentityErrors & {
  bottleFormat?: string;
  bottleFormatOther?: string;
};

const MAX_BOTTLE_FORMAT_OTHER_LENGTH = 60;
const MAX_STORAGE_LOCATION_LENGTH = 120;
const MAX_PERSONAL_NOTE_LENGTH = 500;

export const EMPTY_CELLAR_BOTTLE: CellarBottleFormInput = {
  country: "",
  region: "",
  grapeBlendMode: "single",
  grapeBlend: "",
  selectedGrapes: [],
  otherGrapesText: "",
  producer: "",
  wineName: "",
  vintage: "",
  wineStyle: "",
  bottleFormat: "750ml",
  bottleFormatOther: "",
  storageLocation: "",
  personalNote: "",
};

/**
 * Reuses validateBottleForm (the exact same wine-identity rules the tasting
 * bottle form enforces) and adds only the two cellar-only checks — never a
 * parallel, potentially-diverging rule set. Storage location / personal note
 * length caps mirror the server-side RPC limits (see schema.sql) so a
 * too-long value is caught before the round trip, not just after it.
 */
export function validateCellarBottleForm(input: CellarBottleFormInput): CellarBottleFormErrors {
  const errors: CellarBottleFormErrors = validateBottleForm(input);

  if (!BOTTLE_FORMATS.includes(input.bottleFormat)) {
    errors.bottleFormat = "Choose a bottle format.";
  } else if (input.bottleFormat === "other" && !input.bottleFormatOther.trim()) {
    errors.bottleFormatOther = "Add a short detail for this bottle format.";
  } else if (input.bottleFormatOther.length > MAX_BOTTLE_FORMAT_OTHER_LENGTH) {
    errors.bottleFormatOther = "That detail is too long — please shorten it.";
  }

  return errors;
}

export function isStorageLocationTooLong(value: string): boolean {
  return value.length > MAX_STORAGE_LOCATION_LENGTH;
}

export function isPersonalNoteTooLong(value: string): boolean {
  return value.length > MAX_PERSONAL_NOTE_LENGTH;
}

/**
 * Maps a cellar bottle row to editable form state, for the edit page.
 * Mirrors `bottleFormInputFromDto`'s legacy-blend-reconstruction fallback so
 * a blend saved before the structured picker existed doesn't appear empty.
 */
export function cellarBottleFormInputFromRow(row: CellarBottleRow): CellarBottleFormInput {
  const grapeBlendMode = row.grape_blend_mode ?? "single";
  let selectedGrapes = row.grape_blend_components?.selectedGrapes ?? [];
  let otherGrapesText = row.grape_blend_components?.otherGrapesText ?? "";
  if (grapeBlendMode === "blend" && selectedGrapes.length === 0 && !otherGrapesText && row.grape_blend) {
    const reconstructed = reconstructBlendComponentsFromText(row.grape_blend);
    selectedGrapes = reconstructed.selectedGrapes;
    otherGrapesText = reconstructed.otherGrapesText;
  }

  return {
    country: row.country,
    region: row.region,
    grapeBlendMode,
    grapeBlend: row.grape_blend,
    selectedGrapes,
    otherGrapesText,
    producer: row.producer,
    wineName: row.wine_cuvee,
    vintage: row.vintage,
    wineStyle: row.wine_style,
    bottleFormat: row.bottle_format,
    bottleFormatOther: row.bottle_format_other ?? "",
    storageLocation: row.storage_location ?? "",
    personalNote: row.personal_note ?? "",
  };
}

function grapeBlendComponentsPayload(input: CellarBottleFormInput) {
  return input.grapeBlendMode === "blend"
    ? { selectedGrapes: input.selectedGrapes, otherGrapesText: input.otherGrapesText }
    : null;
}

/** Shared RPC-argument shape for add_cellar_bottle / update_cellar_bottle — see lib/supabase/cellarActions.ts. */
export function cellarBottleRpcArgs(input: CellarBottleFormInput) {
  return {
    p_country: input.country,
    p_region: input.region,
    p_grape_blend_mode: input.grapeBlendMode || null,
    p_grape_blend: input.grapeBlend,
    p_grape_blend_components: grapeBlendComponentsPayload(input),
    p_producer: input.producer,
    p_wine_cuvee: input.wineName,
    p_vintage: input.vintage,
    p_wine_style: input.wineStyle || null,
    p_bottle_format: input.bottleFormat,
    p_bottle_format_other: input.bottleFormat === "other" ? input.bottleFormatOther.trim() : null,
    p_storage_location: input.storageLocation.trim() || null,
    p_personal_note: input.personalNote.trim() || null,
  };
}

/** "Producer — Wine/cuvée Vintage", used consistently across the cellar list, selector, and confirmation panel. */
export function cellarWineIdentityLabel(row: {
  producer: string;
  wine_cuvee: string;
  vintage: string;
}): string {
  return `${row.producer} — ${row.wine_cuvee} ${row.vintage}`.trim();
}

/** "750ml (standard)" or, for a custom format, its free-text detail — e.g. "3L double magnum". */
export function cellarBottleFormatLabel(row: { bottle_format: BottleFormat; bottle_format_other: string | null }): string {
  if (row.bottle_format === "other" && row.bottle_format_other) {
    return row.bottle_format_other;
  }
  return BOTTLE_FORMAT_LABELS[row.bottle_format];
}
