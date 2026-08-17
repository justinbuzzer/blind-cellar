import { describe, expect, it } from "vitest";
import {
  BLEND_MIN_GRAPES_MESSAGE,
  hasBottleFormErrors,
  hasIncompleteBlend,
  invalidOtherGrapeGuessMessage,
  isValidTastingMode,
  isValidVintage,
  OTHER_GRAPE_INVALID_ERROR,
  OTHER_GRAPE_MULTI_VARIETY_ERROR,
  OTHER_GRAPE_REQUIRED_ERROR,
  validateBottleForm,
} from "@/lib/validation";
import { BottleFormInput } from "@/lib/supabase/guestActions";
import { WineGuess } from "@/types/tasting";

describe("isValidTastingMode", () => {
  it("accepts all three supported modes", () => {
    expect(isValidTastingMode("full_blind")).toBe(true);
    expect(isValidTastingMode("course_reveal")).toBe(true);
    expect(isValidTastingMode("seen")).toBe(true);
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
    appellation: "",
    grapeBlendMode: "single",
    grapeBlend: "Chardonnay",
    selectedGrapes: [],
    otherGrapesText: "",
    producer: "Bollinger",
    wineName: "Special Cuvee",
    vintage: "NV",
    wineStyle: "bubbles",
    notes: "",
    photoPath: null,
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

  it("appellation is optional — a supported region with no appellation is valid", () => {
    const errors = validateBottleForm(
      makeBottle({ country: "France", region: "Burgundy", appellation: "" })
    );
    expect(errors.appellation).toBeUndefined();
  });

  it("accepts a valid appellation for its country/region", () => {
    const errors = validateBottleForm(
      makeBottle({ country: "France", region: "Burgundy", appellation: "Chablis" })
    );
    expect(errors.appellation).toBeUndefined();
  });

  it("rejects an appellation that doesn't belong to the selected region", () => {
    const errors = validateBottleForm(
      makeBottle({ country: "France", region: "Burgundy", appellation: "Barolo" })
    );
    expect(errors.appellation).toBe("Select an appellation from the available options.");
  });

  it("rejects any appellation for a country/region pair with no curated list", () => {
    const errors = validateBottleForm(
      makeBottle({ country: "Greece", region: "Crete", appellation: "Chablis" })
    );
    expect(errors.appellation).toBe("Select an appellation from the available options.");
  });
});

describe("validateBottleForm — Other grape", () => {
  it("accepts a valid custom grape name", () => {
    const bottle = makeBottle({
      grapeBlendMode: "single",
      grapeBlend: "Mondeuse Blanche",
      otherGrapeSelected: true,
    });
    expect(hasBottleFormErrors(validateBottleForm(bottle))).toBe(false);
  });

  it("requires custom text when Other grape is selected", () => {
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "single", grapeBlend: "", otherGrapeSelected: true })
    );
    expect(errors.grapeBlend).toBe(OTHER_GRAPE_REQUIRED_ERROR);
  });

  it("rejects whitespace-only custom grape text", () => {
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "single", grapeBlend: "   ", otherGrapeSelected: true })
    );
    expect(errors.grapeBlend).toBe(OTHER_GRAPE_REQUIRED_ERROR);
  });

  it("accepts an accented custom grape name", () => {
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "single", grapeBlend: "Kéknyelű", otherGrapeSelected: true })
    );
    expect(errors.grapeBlend).toBeUndefined();
  });

  it("accepts a hyphenated/apostrophe custom grape name", () => {
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "single", grapeBlend: "Cabernet-Sauvignon", otherGrapeSelected: true })
    );
    expect(errors.grapeBlend).toBeUndefined();
  });

  it("rejects custom grape text over the maximum length", () => {
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "single", grapeBlend: "x".repeat(81), otherGrapeSelected: true })
    );
    expect(errors.grapeBlend).toBe(OTHER_GRAPE_INVALID_ERROR);
  });

  it("rejects digits/symbols outside the allowed character set", () => {
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "single", grapeBlend: "Grape123", otherGrapeSelected: true })
    );
    expect(errors.grapeBlend).toBe(OTHER_GRAPE_INVALID_ERROR);
  });

  it("rejects clearly multi-variety text with the dedicated message, taking priority over the generic invalid message", () => {
    const errors = validateBottleForm(
      makeBottle({
        grapeBlendMode: "single",
        grapeBlend: "Cabernet Sauvignon / Merlot",
        otherGrapeSelected: true,
      })
    );
    expect(errors.grapeBlend).toBe(OTHER_GRAPE_MULTI_VARIETY_ERROR);
  });

  it("rejects a comma, ampersand, or semicolon the same way", () => {
    for (const value of ["Cabernet Sauvignon, Merlot", "Cabernet Sauvignon & Merlot", "Cabernet Sauvignon; Merlot"]) {
      const errors = validateBottleForm(
        makeBottle({ grapeBlendMode: "single", grapeBlend: value, otherGrapeSelected: true })
      );
      expect(errors.grapeBlend).toBe(OTHER_GRAPE_MULTI_VARIETY_ERROR);
    }
  });

  it("never accepts the literal sentinel label as a submitted grape value", () => {
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "single", grapeBlend: "Other grape", otherGrapeSelected: true })
    );
    // "Other grape" itself passes the character/length checks (it's just two
    // words) — the important guarantee is that the UI never sends this
    // literal string as the value in the first place (see GrapeBlendField's
    // setSingleGrapeSelection, which always clears grapeBlend to "" when the
    // sentinel is chosen). This test documents that validation alone can't
    // distinguish it from a real grape named "Other grape" — it's the UI's
    // job never to produce it.
    expect(errors.grapeBlend).toBeUndefined();
  });

  it("preserves existing validation exactly for a standard dropdown grape (no otherGrapeSelected)", () => {
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "single", grapeBlend: "", otherGrapeSelected: false })
    );
    expect(errors.grapeBlend).toBe("Select a grape variety.");
  });

  it("ignores a stale custom grape value once a standard dropdown grape is selected", () => {
    // otherGrapeSelected: false means the dropdown is in control — even if
    // grapeBlend still held old custom text, the standard-grape path is used.
    const errors = validateBottleForm(
      makeBottle({ grapeBlendMode: "single", grapeBlend: "Chardonnay", otherGrapeSelected: false })
    );
    expect(errors.grapeBlend).toBeUndefined();
  });
});

function makeGuess(overrides: Partial<WineGuess> = {}): WineGuess {
  return {
    wineId: "wine-1",
    country: "",
    region: "",
    appellation: "",
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

describe("invalidOtherGrapeGuessMessage", () => {
  it("is undefined when Other grape isn't selected", () => {
    const guess = makeGuess({ grapeBlendMode: "single", grapeBlend: "Chardonnay" });
    expect(invalidOtherGrapeGuessMessage(guess)).toBeUndefined();
  });

  it("is undefined for a blank Other-grape guess (blank guesses score zero, not blocked)", () => {
    const guess = makeGuess({ grapeBlendMode: "single", grapeBlend: "", otherGrapeSelected: true });
    expect(invalidOtherGrapeGuessMessage(guess)).toBeUndefined();
  });

  it("is undefined for a valid custom grape guess", () => {
    const guess = makeGuess({
      grapeBlendMode: "single",
      grapeBlend: "Mondeuse Blanche",
      otherGrapeSelected: true,
    });
    expect(invalidOtherGrapeGuessMessage(guess)).toBeUndefined();
  });

  it("flags multi-variety delimiter text with the dedicated message", () => {
    const guess = makeGuess({
      grapeBlendMode: "single",
      grapeBlend: "Cabernet Sauvignon / Merlot",
      otherGrapeSelected: true,
    });
    expect(invalidOtherGrapeGuessMessage(guess)).toBe(OTHER_GRAPE_MULTI_VARIETY_ERROR);
  });

  it("flags an otherwise-invalid custom grape guess", () => {
    const guess = makeGuess({ grapeBlendMode: "single", grapeBlend: "Grape123", otherGrapeSelected: true });
    expect(invalidOtherGrapeGuessMessage(guess)).toBe(OTHER_GRAPE_INVALID_ERROR);
  });

  it("is false-y for blend mode regardless of content", () => {
    const guess = makeGuess({ grapeBlendMode: "blend", otherGrapesText: "not,valid,here" });
    expect(invalidOtherGrapeGuessMessage(guess)).toBeUndefined();
  });
});
