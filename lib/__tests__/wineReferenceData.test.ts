import { describe, expect, it } from "vitest";
import {
  blendTokensFromText,
  canonicalizeGrapeToken,
  COUNTRIES,
  isKnownCountry,
  isKnownGrapeVariety,
  isValidRegionForCountry,
  regionOptionsForCountry,
  resetRegionIfInvalid,
} from "@/lib/wineReferenceData";

describe("COUNTRIES", () => {
  it("includes every country named in the spec", () => {
    for (const name of [
      "Argentina",
      "Australia",
      "Austria",
      "Chile",
      "France",
      "Germany",
      "Greece",
      "Hungary",
      "Italy",
      "New Zealand",
      "Portugal",
      "South Africa",
      "Spain",
      "United States",
      "United Kingdom",
      "Other / Unknown",
    ]) {
      expect(COUNTRIES).toContain(name);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
  });
});

describe("regionOptionsForCountry / isValidRegionForCountry", () => {
  it("filters regions to only the selected country", () => {
    const franceRegions = regionOptionsForCountry("France").map((r) => r.value);
    expect(franceRegions).toContain("Bordeaux");
    expect(franceRegions).toContain("Burgundy");
    expect(franceRegions).not.toContain("Piedmont");
    expect(franceRegions).not.toContain("California");
  });

  it("returns no options for an unknown country", () => {
    expect(regionOptionsForCountry("Narnia")).toEqual([]);
  });

  it("validates a region only against its own country's list", () => {
    expect(isValidRegionForCountry("France", "Bordeaux")).toBe(true);
    expect(isValidRegionForCountry("Italy", "Bordeaux")).toBe(false);
  });

  it("every country has at least one region, including Other / Unknown", () => {
    for (const country of COUNTRIES) {
      expect(regionOptionsForCountry(country).length).toBeGreaterThan(0);
    }
  });
});

describe("resetRegionIfInvalid", () => {
  it("keeps the region when it's still valid for the new country", () => {
    expect(resetRegionIfInvalid("France", "Bordeaux")).toBe("Bordeaux");
  });

  it("clears the region when it's invalid for the new country", () => {
    expect(resetRegionIfInvalid("Italy", "Bordeaux")).toBe("");
  });

  it("clears the region when no country is selected", () => {
    expect(resetRegionIfInvalid("", "Bordeaux")).toBe("");
  });
});

describe("isKnownCountry", () => {
  it("recognises a curated country", () => {
    expect(isKnownCountry("France")).toBe(true);
  });

  it("rejects free text not in the curated list", () => {
    expect(isKnownCountry("Freedonia")).toBe(false);
  });
});

describe("canonicalizeGrapeToken alias equivalence", () => {
  it("treats Syrah and Shiraz as equivalent", () => {
    expect(canonicalizeGrapeToken("Syrah")).toBe(canonicalizeGrapeToken("Shiraz"));
  });

  it("treats Pinot Gris and Pinot Grigio as equivalent", () => {
    expect(canonicalizeGrapeToken("Pinot Gris")).toBe(canonicalizeGrapeToken("Pinot Grigio"));
  });

  it("treats Zinfandel and Primitivo as equivalent", () => {
    expect(canonicalizeGrapeToken("Zinfandel")).toBe(canonicalizeGrapeToken("Primitivo"));
  });

  it("does not treat unrelated grapes as equivalent", () => {
    expect(canonicalizeGrapeToken("Merlot")).not.toBe(canonicalizeGrapeToken("Malbec"));
  });

  it("is case- and whitespace-insensitive", () => {
    expect(canonicalizeGrapeToken("  shiraz  ")).toBe(canonicalizeGrapeToken("Syrah"));
  });

  it("falls back to plain normalised text for an unrecognised grape, without guessing", () => {
    expect(canonicalizeGrapeToken("Some Obscure Field Blend Grape")).toBe(
      canonicalizeGrapeToken("some obscure field blend grape")
    );
    expect(canonicalizeGrapeToken("Some Obscure Field Blend Grape")).not.toBe(
      canonicalizeGrapeToken("Merlot")
    );
  });

  it("returns an empty string for blank input", () => {
    expect(canonicalizeGrapeToken("")).toBe("");
    expect(canonicalizeGrapeToken("   ")).toBe("");
  });
});

describe("isKnownGrapeVariety", () => {
  it("recognises curated grapes and their aliases", () => {
    expect(isKnownGrapeVariety("Nebbiolo")).toBe(true);
    expect(isKnownGrapeVariety("Shiraz")).toBe(true);
  });

  it("rejects an unrecognised grape", () => {
    expect(isKnownGrapeVariety("Not A Real Grape")).toBe(false);
  });
});

describe("blendTokensFromText", () => {
  it("splits on commas, slashes, semicolons, ampersands, and hyphens", () => {
    expect(blendTokensFromText("Cabernet Sauvignon/Merlot")).toHaveLength(2);
    expect(blendTokensFromText("Cabernet Sauvignon, Merlot")).toHaveLength(2);
    expect(blendTokensFromText("Cabernet Sauvignon; Merlot")).toHaveLength(2);
    expect(blendTokensFromText("Cabernet Sauvignon & Merlot")).toHaveLength(2);
    expect(blendTokensFromText("Grenache-Syrah-Mourvedre")).toHaveLength(3);
  });

  it("produces the same token set regardless of order", () => {
    const a = new Set(blendTokensFromText("Cabernet Sauvignon / Merlot"));
    const b = new Set(blendTokensFromText("Merlot / Cabernet Sauvignon"));
    expect(a).toEqual(b);
  });

  it("resolves aliases within a blend", () => {
    const tokens = blendTokensFromText("Grenache / Shiraz");
    expect(tokens).toContain(canonicalizeGrapeToken("Syrah"));
  });

  it("drops empty tokens from stray separators", () => {
    expect(blendTokensFromText("Merlot // Cabernet Franc")).toHaveLength(2);
  });
});
