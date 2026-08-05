import { describe, expect, it } from "vitest";
import {
  BLEND_MIN_GRAPES_MESSAGE,
  hasBottleFormErrors,
  hasIncompleteBlend,
  isValidTastingMode,
  isValidVintage,
  validateBottleForm,
} from "@/lib/validation";
import { BottleFormInput } from "@/lib/supabase/guestActions";
import { WineGuess } from "@/types/tasting";

describe("isValidTastingMode", () => {
  it("accepts both supported modes", () => {
    expect(isValidTastingMode("full_blind")).toBe(true);
    expect(isValidTastingMode("course_reveal")).toBe(true);
  });

  it("rejects anything else, including blank/unset", () => {
    expect(isValidTastingMode("")).toBe(false);
    expect(isValidTastingMode("blind")).toBe(false);
    expect(isValidTastingMode("Full Blind")).toBe(false);
  });
});

describe("isValidVintage", () => {
  it("accepts a plausible four-digit year", () => {
    expect(isValidVintage("2019")).toBe(true);
  });

  it("accepts NV (non-vintage), case-insensitively", () => {
    expect(isValidVintage("NV")).toBe(true);
    expect(isValidVintage("nv")).toBe(true);
  });

  it("rejects a year that isn't four digits", () => {
    expect(isValidVintage("19")).toBe(false);
    expect(isValidVintage("20195")).toBe(false);
  });

  it("rejects non-numeric junk", () => {
    expect(isValidVintage("abcd")).toBe(false);
    expect(isValidVintage("")).toBe(false);
  });

  it("rejects an implausibly old or far-future year", () => {
    expect(isValidVintage("1800")).toBe(false);
    expect(isValidVintage(String(new Date().getFullYear() + 5))).toBe(false);
  });
});

function makeBottle(overrides: Partial<BottleFormInput> = {}): BottleFormInput {
  return {
    country: "France",
    region: "Champagne",
    grapeBlendMode: "single",
    grapeBlend: "Chardonnay",
    selectedGrapes: [],
    otherGrapesText: "",
    producer: "Bollinger",
    wineName: "Special Cuvee",
    vintage: "NV",
    wineStyle: "bubbles",
    notes: "",
    ...overrides,
  };
}

describe("validateBottleForm", () => {
  it("passes a fully filled-in bottle (single variety)", () => {
    expect(hasBottleFormErrors(validateBottleForm(makeBottle()))).toBe(false);
  });

  it("passes a fully filled-in bottle (blend)", () => {
    const bottle = makeBottle({
      grapeBlendMode: "blend",
      selectedGrapes: ["Pinot Noir", "Chardonnay"],
    });
    expect(hasBottleFormErrors(validateBottleForm(bottle))).toBe(false);
  });

  it("does not require a price band — the field no longer exists on BottleFormInput", () => {
    const bottle = makeBottle();
    expect("priceBand" in bottle).toBe(false);
    expect(hasBottleFormErrors(validateBottleForm(bottle))).toBe(false);
  });

  it("requires a country from the controlled list, rejecting free text", () => {
    const errors = validateBottleForm(makeBottle({ country: "Freedonia" }));
    expect(errors.country).toBeDefined();
  });

  it("requires a region valid for the selected country", () => {
    const errors = validateBottleForm(makeBottle({ country: "France", region: "Napa Valley" }));
    expect(errors.region).toBeDefined();
  });

  it("requires a grape/blend mode to be chosen", () => {
    const errors = validateBottleForm(makeBottle({ grapeBlendMode: "" as never }));
    expect(errors.grapeBlendMode).toBeDefined();
  });

  it("single variety mode requires a dropdown selection", () => {
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "single", grapeBlend: "" })
    );
    expect(errors.grapeBlend).toBeDefined();
  });

  it("blend mode requires non-empty free text", () => {
    const errors = validateBottleForm(makeBottle({ grapeBlendMode: "blend", grapeBlend: "" }));
    expect(errors.grapeBlend).toBeDefined();
  });

  it("blend mode rejects exactly one selected grape with the exact required message", () => {
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "blend", selectedGrapes: ["Merlot"] })
    );
    expect(errors.grapeBlend).toBe(BLEND_MIN_GRAPES_MESSAGE);
  });

  it("blend mode rejects one selected grape plus a duplicate of it typed as other-grapes text", () => {
    // Test #8: a known grape can't be double-counted through selected + other-grape text
    // to sneak past the two-grape minimum.
    const errors = validateBottleForm(
      makeBottle({
        grapeBlendMode: "blend",
        selectedGrapes: ["Merlot"],
        otherGrapesText: "Merlot",
      })
    );
    expect(errors.grapeBlend).toBe(BLEND_MIN_GRAPES_MESSAGE);
  });

  it("blend mode accepts exactly two selected grapes", () => {
    const bottle = makeBottle({
      grapeBlendMode: "blend",
      selectedGrapes: ["Merlot", "Cabernet Sauvignon"],
    });
    expect(hasBottleFormErrors(validateBottleForm(bottle))).toBe(false);
  });

  it("blend mode accepts unlisted grapes typed as free text, not just curated picks", () => {
    const bottle = makeBottle({
      grapeBlendMode: "blend",
      otherGrapesText: "Carignan, Counoise",
    });
    expect(hasBottleFormErrors(validateBottleForm(bottle))).toBe(false);
  });

  it("blend mode accepts a mix of curated picks and unlisted free text", () => {
    const bottle = makeBottle({
      grapeBlendMode: "blend",
      selectedGrapes: ["Grenache"],
      otherGrapesText: "Counoise",
    });
    expect(hasBottleFormErrors(validateBottleForm(bottle))).toBe(false);
  });

  it("flags every required field when blank", () => {
    const errors = validateBottleForm(
      makeBottle({
        country: "",
        region: "",
        grapeBlendMode: "" as never,
        producer: "",
        wineName: "",
        vintage: "",
        wineStyle: "",
      })
    );
    expect(errors.country).toBeDefined();
    expect(errors.region).toBeDefined();
    expect(errors.grapeBlendMode).toBeDefined();
    expect(errors.producer).toBeDefined();
    expect(errors.wineName).toBeDefined();
    expect(errors.vintage).toBeDefined();
    expect(errors.wineStyle).toBeDefined();
  });

  it("flags an invalid vintage even when non-empty", () => {
    const errors = validateBottleForm(makeBottle({ vintage: "not-a-year" }));
    expect(errors.vintage).toBeDefined();
  });

  it("requires a wine style to be chosen", () => {
    const errors = validateBottleForm(makeBottle({ wineStyle: "" }));
    expect(errors.wineStyle).toBeDefined();
  });

  it("accepts every valid wine style", () => {
    for (const style of ["bubbles", "white", "red", "sweet", "other"] as const) {
      const errors = validateBottleForm(makeBottle({ wineStyle: style }));
      expect(errors.wineStyle).toBeUndefined();
    }
  });
});

function makeGuess(overrides: Partial<WineGuess> = {}): WineGuess {
  return {
    wineId: "wine-1",
    country: "",
    region: "",
    grapeBlendMode: "single",
    grapeBlend: "",
    selectedGrapes: [],
    otherGrapesText: "",
    producer: "",
    wineName: "",
    vintage: "",
    rating: null,
    confidence: "medium",
    ...overrides,
  };
}

describe("hasIncompleteBlend", () => {
  it("is false for single-variety mode, regardless of content", () => {
    expect(hasIncompleteBlend(makeGuess({ grapeBlendMode: "single" }))).toBe(false);
  });

  it("is false for a completely blank blend guess (blank guesses score zero, not blocked)", () => {
    expect(hasIncompleteBlend(makeGuess({ grapeBlendMode: "blend" }))).toBe(false);
  });

  it("is true when a blend guess has exactly one selected grape", () => {
    const guess = makeGuess({ grapeBlendMode: "blend", selectedGrapes: ["Merlot"] });
    expect(hasIncompleteBlend(guess)).toBe(true);
  });

  it("is true when a blend guess has exactly one grape via other-grapes text", () => {
    const guess = makeGuess({ grapeBlendMode: "blend", otherGrapesText: "Carignan" });
    expect(hasIncompleteBlend(guess)).toBe(true);
  });

  it("is false when a blend guess has two or more grapes", () => {
    const guess = makeGuess({
      grapeBlendMode: "blend",
      selectedGrapes: ["Merlot", "Cabernet Sauvignon"],
    });
    expect(hasIncompleteBlend(guess)).toBe(false);
  });
});
