import { describe, expect, it } from "vitest";
import { hasBottleFormErrors, isValidVintage, validateBottleForm } from "@/lib/validation";
import { BottleFormInput } from "@/lib/supabase/guestActions";

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
    producer: "Bollinger",
    wineName: "Special Cuvee",
    vintage: "NV",
    notes: "",
    ...overrides,
  };
}

describe("validateBottleForm", () => {
  it("passes a fully filled-in bottle (single variety)", () => {
    expect(hasBottleFormErrors(validateBottleForm(makeBottle()))).toBe(false);
  });

  it("passes a fully filled-in bottle (blend)", () => {
    const bottle = makeBottle({ grapeBlendMode: "blend", grapeBlend: "Pinot Noir / Chardonnay" });
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

  it("blend mode accepts free text not on the single-variety list", () => {
    const bottle = makeBottle({
      grapeBlendMode: "blend",
      grapeBlend: "A field blend of old, unnamed local varieties",
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
      })
    );
    expect(errors.country).toBeDefined();
    expect(errors.region).toBeDefined();
    expect(errors.grapeBlendMode).toBeDefined();
    expect(errors.producer).toBeDefined();
    expect(errors.wineName).toBeDefined();
    expect(errors.vintage).toBeDefined();
  });

  it("flags an invalid vintage even when non-empty", () => {
    const errors = validateBottleForm(makeBottle({ vintage: "not-a-year" }));
    expect(errors.vintage).toBeDefined();
  });
});
