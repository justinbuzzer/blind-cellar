import { describe, expect, it } from "vitest";
import {
  CELLAR_QUANTITY_ERROR,
  CellarBottleFormInput,
  EMPTY_CELLAR_BOTTLE,
  MAX_CELLAR_QUANTITY,
  MIN_CELLAR_QUANTITY,
  cellarBottleFormInputFromRow,
  cellarBottleFormatLabel,
  cellarBottleRpcArgs,
  cellarWineIdentityLabel,
  isCellarBottleDeletable,
  isPersonalNoteTooLong,
  isStorageLocationTooLong,
  validateCellarBottleForm,
} from "@/lib/cellar";
import { hasBottleFormErrors } from "@/lib/validation";
import { CellarBottleRow } from "@/lib/supabase/types";

function makeCellarBottle(overrides: Partial<CellarBottleFormInput> = {}): CellarBottleFormInput {
  return {
    ...EMPTY_CELLAR_BOTTLE,
    country: "France",
    region: "Champagne",
    grapeBlendMode: "single",
    grapeBlend: "Chardonnay",
    producer: "Bollinger",
    wineName: "Special Cuvee",
    vintage: "NV",
    wineStyle: "bubbles",
    bottleFormat: "750ml",
    ...overrides,
  };
}

function makeCellarRow(overrides: Partial<CellarBottleRow> = {}): CellarBottleRow {
  return {
    id: "cellar-1",
    wine_style: "red",
    country: "France",
    region: "Burgundy",
    appellation: null,
    grape_blend_mode: "single",
    grape_blend: "Pinot Noir",
    grape_blend_components: null,
    vintage: "2019",
    producer: "Domaine Example",
    wine_cuvee: "Nuits-Saint-Georges",
    bottle_format: "750ml",
    bottle_format_other: null,
    storage_location: null,
    personal_note: null,
    status: "available",
    reserved_session_id: null,
    reserved_tasting_bottle_id: null,
    reserved_at: null,
    consumed_at: null,
    consumed_session_id: null,
    consumed_tasting_bottle_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("validateCellarBottleForm", () => {
  it("passes a fully filled-in bottle", () => {
    expect(hasBottleFormErrors(validateCellarBottleForm(makeCellarBottle()))).toBe(false);
  });

  it("reuses wine-identity validation — a missing producer is flagged the same as the tasting bottle form", () => {
    const errors = validateCellarBottleForm(makeCellarBottle({ producer: "" }));
    expect(errors.producer).toBeDefined();
  });

  it("accepts every controlled bottle format without a detail", () => {
    for (const format of ["375ml", "500ml", "750ml", "1500ml"] as const) {
      const errors = validateCellarBottleForm(makeCellarBottle({ bottleFormat: format }));
      expect(errors.bottleFormat).toBeUndefined();
      expect(errors.bottleFormatOther).toBeUndefined();
    }
  });

  it("requires a detail when format is 'other'", () => {
    const errors = validateCellarBottleForm(
      makeCellarBottle({ bottleFormat: "other", bottleFormatOther: "" })
    );
    expect(errors.bottleFormatOther).toBeDefined();
  });

  it("accepts 'other' once a detail is provided", () => {
    const errors = validateCellarBottleForm(
      makeCellarBottle({ bottleFormat: "other", bottleFormatOther: "3L double magnum" })
    );
    expect(errors.bottleFormatOther).toBeUndefined();
  });

  it("rejects an overly long format detail", () => {
    const errors = validateCellarBottleForm(
      makeCellarBottle({ bottleFormat: "other", bottleFormatOther: "x".repeat(61) })
    );
    expect(errors.bottleFormatOther).toBeDefined();
  });
});

describe("validateCellarBottleForm — quantity", () => {
  it("defaults to 1 via EMPTY_CELLAR_BOTTLE", () => {
    expect(EMPTY_CELLAR_BOTTLE.quantity).toBe(1);
    expect(MIN_CELLAR_QUANTITY).toBe(1);
  });

  it("accepts every valid integer from 1 to 100", () => {
    for (const quantity of [1, 2, 6, 50, 100]) {
      const errors = validateCellarBottleForm(makeCellarBottle({ quantity }));
      expect(errors.quantity).toBeUndefined();
    }
  });

  it("rejects 0", () => {
    const errors = validateCellarBottleForm(makeCellarBottle({ quantity: 0 }));
    expect(errors.quantity).toBe(CELLAR_QUANTITY_ERROR);
  });

  it("rejects a negative value", () => {
    const errors = validateCellarBottleForm(makeCellarBottle({ quantity: -3 }));
    expect(errors.quantity).toBe(CELLAR_QUANTITY_ERROR);
  });

  it("rejects a decimal value", () => {
    const errors = validateCellarBottleForm(makeCellarBottle({ quantity: 2.5 }));
    expect(errors.quantity).toBe(CELLAR_QUANTITY_ERROR);
  });

  it("rejects a non-numeric value (NaN, e.g. from a blank input)", () => {
    const errors = validateCellarBottleForm(makeCellarBottle({ quantity: NaN }));
    expect(errors.quantity).toBe(CELLAR_QUANTITY_ERROR);
  });

  it("rejects Infinity", () => {
    const errors = validateCellarBottleForm(makeCellarBottle({ quantity: Infinity }));
    expect(errors.quantity).toBe(CELLAR_QUANTITY_ERROR);
  });

  it("rejects a value above the maximum", () => {
    const errors = validateCellarBottleForm(makeCellarBottle({ quantity: MAX_CELLAR_QUANTITY + 1 }));
    expect(errors.quantity).toBe(CELLAR_QUANTITY_ERROR);
  });

  it("uses the exact required error copy", () => {
    expect(CELLAR_QUANTITY_ERROR).toBe("Enter a quantity between 1 and 100.");
  });

  it("never silently rounds — a decimal quantity is rejected outright, not floored/ceiled to a valid one", () => {
    const errors = validateCellarBottleForm(makeCellarBottle({ quantity: 1.9 }));
    expect(errors.quantity).toBeDefined();
  });

  it("leaves every other field's validation unaffected by an invalid quantity", () => {
    const errors = validateCellarBottleForm(makeCellarBottle({ quantity: 0 }));
    expect(errors.producer).toBeUndefined();
    expect(errors.bottleFormat).toBeUndefined();
  });
});

describe("isStorageLocationTooLong / isPersonalNoteTooLong", () => {
  it("allows values at or under the limit", () => {
    expect(isStorageLocationTooLong("Home cellar")).toBe(false);
    expect(isPersonalNoteTooLong("Bought at the domaine")).toBe(false);
  });

  it("rejects values over the limit", () => {
    expect(isStorageLocationTooLong("x".repeat(121))).toBe(true);
    expect(isPersonalNoteTooLong("x".repeat(501))).toBe(true);
  });
});

describe("cellarBottleFormInputFromRow", () => {
  it("maps every field from a row, defaulting null optional fields to empty strings", () => {
    const row = makeCellarRow();
    const input = cellarBottleFormInputFromRow(row);
    expect(input.producer).toBe("Domaine Example");
    expect(input.wineName).toBe("Nuits-Saint-Georges");
    expect(input.bottleFormat).toBe("750ml");
    expect(input.bottleFormatOther).toBe("");
    expect(input.storageLocation).toBe("");
    expect(input.personalNote).toBe("");
    expect(input.quantity).toBe(1);
  });

  it("preserves storage location and personal note when present", () => {
    const row = makeCellarRow({ storage_location: "Rack B", personal_note: "Open for anniversary" });
    const input = cellarBottleFormInputFromRow(row);
    expect(input.storageLocation).toBe("Rack B");
    expect(input.personalNote).toBe("Open for anniversary");
  });

  it("reconstructs a legacy blend with no structured components from its flattened text", () => {
    const row = makeCellarRow({
      grape_blend_mode: "blend",
      grape_blend: "Cabernet Sauvignon / Merlot",
      grape_blend_components: null,
    });
    const input = cellarBottleFormInputFromRow(row);
    expect(input.selectedGrapes.sort()).toEqual(["Cabernet Sauvignon", "Merlot"]);
  });

  it("defaults a missing grape_blend_mode to single, matching bottleFormInputFromDto's convention", () => {
    const row = makeCellarRow({ grape_blend_mode: null });
    const input = cellarBottleFormInputFromRow(row);
    expect(input.grapeBlendMode).toBe("single");
  });

  it("defaults a null appellation to an empty string", () => {
    const row = makeCellarRow({ appellation: null });
    const input = cellarBottleFormInputFromRow(row);
    expect(input.appellation).toBe("");
  });

  it("preserves an existing appellation", () => {
    const row = makeCellarRow({ region: "Burgundy", appellation: "Chablis" });
    const input = cellarBottleFormInputFromRow(row);
    expect(input.appellation).toBe("Chablis");
  });

  it("sets otherGrapeSelected and preserves the custom text when the stored grape isn't on the curated list", () => {
    const row = makeCellarRow({ grape_blend_mode: "single", grape_blend: "Mondeuse Blanche" });
    const input = cellarBottleFormInputFromRow(row);
    expect(input.otherGrapeSelected).toBe(true);
    expect(input.grapeBlend).toBe("Mondeuse Blanche");
  });

  it("leaves otherGrapeSelected false for a curated single-variety grape", () => {
    const row = makeCellarRow({ grape_blend_mode: "single", grape_blend: "Pinot Noir" });
    const input = cellarBottleFormInputFromRow(row);
    expect(input.otherGrapeSelected).toBe(false);
  });

  it("leaves otherGrapeSelected false in blend mode regardless of content", () => {
    const row = makeCellarRow({
      grape_blend_mode: "blend",
      grape_blend: "Cabernet Sauvignon / Merlot",
    });
    const input = cellarBottleFormInputFromRow(row);
    expect(input.otherGrapeSelected).toBe(false);
  });
});

describe("cellarBottleRpcArgs", () => {
  it("sends null grape_blend_components for single-variety mode", () => {
    const args = cellarBottleRpcArgs(makeCellarBottle({ grapeBlendMode: "single" }));
    expect(args.p_grape_blend_components).toBeNull();
  });

  it("sends structured components for blend mode", () => {
    const args = cellarBottleRpcArgs(
      makeCellarBottle({
        grapeBlendMode: "blend",
        selectedGrapes: ["Merlot", "Cabernet Sauvignon"],
        otherGrapesText: "",
      })
    );
    expect(args.p_grape_blend_components).toEqual({
      selectedGrapes: ["Merlot", "Cabernet Sauvignon"],
      otherGrapesText: "",
    });
  });

  it("sends null bottle_format_other unless format is 'other'", () => {
    const args = cellarBottleRpcArgs(makeCellarBottle({ bottleFormat: "750ml", bottleFormatOther: "ignored" }));
    expect(args.p_bottle_format_other).toBeNull();
  });

  it("trims and nulls out blank storage location and personal note", () => {
    const args = cellarBottleRpcArgs(makeCellarBottle({ storageLocation: "   ", personalNote: "  " }));
    expect(args.p_storage_location).toBeNull();
    expect(args.p_personal_note).toBeNull();
  });

  it("preserves a real storage location and personal note", () => {
    const args = cellarBottleRpcArgs(
      makeCellarBottle({ storageLocation: "Wine fridge", personalNote: "Check cork" })
    );
    expect(args.p_storage_location).toBe("Wine fridge");
    expect(args.p_personal_note).toBe("Check cork");
  });

  it("sends null for a blank appellation", () => {
    const args = cellarBottleRpcArgs(makeCellarBottle({ appellation: "   " }));
    expect(args.p_appellation).toBeNull();
  });

  it("sends a trimmed appellation when present", () => {
    const args = cellarBottleRpcArgs(
      makeCellarBottle({ region: "Burgundy", appellation: "Chablis" })
    );
    expect(args.p_appellation).toBe("Chablis");
  });

  it("never includes quantity — update_cellar_bottle has no such parameter, so it's added separately only for the add call (see lib/supabase/cellarActions.ts)", () => {
    const args = cellarBottleRpcArgs(makeCellarBottle({ quantity: 6 }));
    expect(args).not.toHaveProperty("p_quantity");
  });

  it("sends the custom grape text directly as p_grape_blend, with no separate otherGrapeSelected/sentinel field", () => {
    const args = cellarBottleRpcArgs(
      makeCellarBottle({ grapeBlendMode: "single", grapeBlend: "Mondeuse Blanche", otherGrapeSelected: true })
    );
    expect(args.p_grape_blend).toBe("Mondeuse Blanche");
    expect(args).not.toHaveProperty("otherGrapeSelected");
    expect(args).not.toHaveProperty("p_other_grape_selected");
  });
});

describe("cellarWineIdentityLabel", () => {
  it("formats as 'Producer — Wine/cuvée Vintage'", () => {
    const row = makeCellarRow({ producer: "Bollinger", wine_cuvee: "Special Cuvee", vintage: "NV" });
    expect(cellarWineIdentityLabel(row)).toBe("Bollinger — Special Cuvee NV");
  });
});

describe("cellarBottleFormatLabel", () => {
  it("shows the canonical label for a controlled format", () => {
    const row = makeCellarRow({ bottle_format: "1500ml", bottle_format_other: null });
    expect(cellarBottleFormatLabel(row)).toBe("Magnum (1.5L)");
  });

  it("shows the free-text detail for 'other'", () => {
    const row = makeCellarRow({ bottle_format: "other", bottle_format_other: "3L double magnum" });
    expect(cellarBottleFormatLabel(row)).toBe("3L double magnum");
  });

  it("falls back to the generic 'Other' label if no detail was recorded", () => {
    const row = makeCellarRow({ bottle_format: "other", bottle_format_other: null });
    expect(cellarBottleFormatLabel(row)).toBe("Other");
  });
});

describe("isCellarBottleDeletable", () => {
  it("allows deletion only for 'available'", () => {
    expect(isCellarBottleDeletable("available")).toBe(true);
  });

  it("rejects 'reserved'", () => {
    expect(isCellarBottleDeletable("reserved")).toBe(false);
  });

  it("rejects 'consumed'", () => {
    expect(isCellarBottleDeletable("consumed")).toBe(false);
  });
});
