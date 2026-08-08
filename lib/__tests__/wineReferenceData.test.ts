import { describe, expect, it } from "vitest";
import {
  blendTokensFromText,
  canonicalizeGrapeToken,
  combineBlendComponents,
  COUNTRIES,
  GRAPE_VARIETIES,
  grapeSkin,
  hasMultiVarietyDelimiter,
  isCustomSingleGrape,
  isGrapeColorCompatibleWithStyle,
  isKnownCountry,
  isKnownGrapeVariety,
  isValidOtherGrapeName,
  isValidRegionForCountry,
  MAX_OTHER_GRAPE_LENGTH,
  parseOtherGrapesText,
  reconstructBlendComponentsFromText,
  regionOptionsForCountry,
  resetRegionIfInvalid,
  resolveKnownGrapeDisplayName,
  singleGrapeVarietyOptionsForStyle,
  singleGrapeVarietyOptionsPreservingCurrent,
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

describe("resolveKnownGrapeDisplayName", () => {
  it("returns the canonical display form for a curated grape", () => {
    expect(resolveKnownGrapeDisplayName("cabernet sauvignon")).toBe("Cabernet Sauvignon");
  });

  it("resolves a known alias to its canonical display form", () => {
    expect(resolveKnownGrapeDisplayName("Shiraz")).toBe("Syrah");
  });

  it("returns null for an unrecognised grape", () => {
    expect(resolveKnownGrapeDisplayName("Some Obscure Field Blend Grape")).toBeNull();
  });
});

describe("parseOtherGrapesText", () => {
  it("splits on commas, slashes, semicolons, ampersands, and line breaks", () => {
    expect(parseOtherGrapesText("Carignan, Counoise")).toEqual(["Carignan", "Counoise"]);
    expect(parseOtherGrapesText("Carignan/Counoise")).toEqual(["Carignan", "Counoise"]);
    expect(parseOtherGrapesText("Carignan; Counoise")).toEqual(["Carignan", "Counoise"]);
    expect(parseOtherGrapesText("Carignan & Counoise")).toEqual(["Carignan", "Counoise"]);
    expect(parseOtherGrapesText("Carignan\nCounoise")).toEqual(["Carignan", "Counoise"]);
  });

  it("does not split on a hyphen (unlike blendTokensFromText)", () => {
    expect(parseOtherGrapesText("Field-Blend Grape")).toEqual(["Field-Blend Grape"]);
  });

  it("trims whitespace around each entry", () => {
    expect(parseOtherGrapesText("  Carignan ,  Counoise  ")).toEqual(["Carignan", "Counoise"]);
  });

  it("drops case-insensitive duplicates within the field", () => {
    expect(parseOtherGrapesText("Carignan, carignan, CARIGNAN")).toEqual(["Carignan"]);
  });

  it("normalises a recognised alias to its canonical display form", () => {
    expect(parseOtherGrapesText("Shiraz, Carignan")).toEqual(["Syrah", "Carignan"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseOtherGrapesText("")).toEqual([]);
    expect(parseOtherGrapesText("   ")).toEqual([]);
  });
});

describe("combineBlendComponents", () => {
  it("merges curated selections with parsed other-grapes text", () => {
    expect(combineBlendComponents(["Merlot"], "Carignan, Counoise")).toEqual([
      "Carignan",
      "Counoise",
      "Merlot",
    ]);
  });

  it("orders the result alphabetically by canonical name, not selection order", () => {
    expect(combineBlendComponents(["Zinfandel", "Albariño"], "")).toEqual([
      "Albariño",
      "Zinfandel",
    ]);
  });

  it("does not let a grape already selected from the curated list be re-added via free text", () => {
    // Test #8: a known grape cannot be duplicated through selected list + other-grape text.
    expect(combineBlendComponents(["Merlot"], "Merlot")).toEqual(["Merlot"]);
  });

  it("cross-deduplicates via alias — selecting Syrah and typing Shiraz is one grape", () => {
    expect(combineBlendComponents(["Syrah"], "Shiraz")).toEqual(["Syrah"]);
  });

  it("returns an empty array when both inputs are empty", () => {
    expect(combineBlendComponents([], "")).toEqual([]);
  });
});

describe("reconstructBlendComponentsFromText", () => {
  it("checks curated grapes it recognises and preserves everything else as other-grapes text", () => {
    const result = reconstructBlendComponentsFromText(
      "Cabernet Sauvignon / Merlot / Some Obscure Field Blend Grape"
    );
    expect(result.selectedGrapes).toEqual(["Cabernet Sauvignon", "Merlot"]);
    expect(result.otherGrapesText).toBe("Some Obscure Field Blend Grape");
  });

  it("resolves aliases to their canonical curated selection", () => {
    const result = reconstructBlendComponentsFromText("Grenache / Shiraz");
    expect(result.selectedGrapes).toEqual(["Grenache", "Syrah"]);
    expect(result.otherGrapesText).toBe("");
  });

  it("preserves entirely unrecognised legacy text verbatim", () => {
    const result = reconstructBlendComponentsFromText("A field blend of old, unnamed local varieties");
    expect(result.selectedGrapes).toEqual([]);
    expect(result.otherGrapesText).toContain("A field blend of old");
  });
});

describe("hasMultiVarietyDelimiter", () => {
  it("detects a comma, slash, ampersand, or semicolon", () => {
    expect(hasMultiVarietyDelimiter("Cabernet Sauvignon, Merlot")).toBe(true);
    expect(hasMultiVarietyDelimiter("Cabernet Sauvignon/Merlot")).toBe(true);
    expect(hasMultiVarietyDelimiter("Cabernet Sauvignon & Merlot")).toBe(true);
    expect(hasMultiVarietyDelimiter("Cabernet Sauvignon; Merlot")).toBe(true);
  });

  it("is false for a plain single grape name, including one with a hyphen", () => {
    expect(hasMultiVarietyDelimiter("Mondeuse Blanche")).toBe(false);
    expect(hasMultiVarietyDelimiter("Cabernet-Sauvignon")).toBe(false);
  });
});

describe("isValidOtherGrapeName", () => {
  it("accepts a plausible custom grape name", () => {
    expect(isValidOtherGrapeName("Mondeuse Blanche")).toBe(true);
  });

  it("accepts accented characters", () => {
    expect(isValidOtherGrapeName("Kéknyelű")).toBe(true);
  });

  it("accepts hyphens and apostrophes", () => {
    expect(isValidOtherGrapeName("Cabernet-Sauvignon")).toBe(true);
    expect(isValidOtherGrapeName("O'Malley Grape")).toBe(true);
  });

  it("rejects a blank or whitespace-only value", () => {
    expect(isValidOtherGrapeName("")).toBe(false);
    expect(isValidOtherGrapeName("   ")).toBe(false);
  });

  it("rejects a value over the maximum length", () => {
    expect(isValidOtherGrapeName("x".repeat(MAX_OTHER_GRAPE_LENGTH))).toBe(true);
    expect(isValidOtherGrapeName("x".repeat(MAX_OTHER_GRAPE_LENGTH + 1))).toBe(false);
  });

  it("rejects digits and other non-letter characters", () => {
    expect(isValidOtherGrapeName("Grape123")).toBe(false);
    expect(isValidOtherGrapeName("Grape!")).toBe(false);
  });
});

describe("grapeSkin / singleGrapeVarietyOptionsForStyle / isGrapeColorCompatibleWithStyle", () => {
  it("classifies every curated grape as red or white", () => {
    for (const grape of GRAPE_VARIETIES) {
      expect(["red", "white"]).toContain(grape.skin);
    }
  });

  it("resolves skin through a known alias", () => {
    expect(grapeSkin("Shiraz")).toBe("red");
    expect(grapeSkin("Garnacha")).toBe("red");
    expect(grapeSkin("Garnacha Blanca")).toBe("white");
  });

  it("returns null for an unrecognised (custom Other grape) value", () => {
    expect(grapeSkin("Mondeuse Blanche")).toBeNull();
    expect(grapeSkin("")).toBeNull();
  });

  it("White style shows only white-skinned grapes", () => {
    const options = singleGrapeVarietyOptionsForStyle("white");
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((g) => g.skin === "white")).toBe(true);
    expect(options.some((g) => g.value === "Chardonnay")).toBe(true);
    expect(options.some((g) => g.value === "Pinot Noir")).toBe(false);
  });

  it("Red style shows only red-skinned grapes", () => {
    const options = singleGrapeVarietyOptionsForStyle("red");
    expect(options.every((g) => g.skin === "red")).toBe(true);
    expect(options.some((g) => g.value === "Pinot Noir")).toBe(true);
    expect(options.some((g) => g.value === "Chardonnay")).toBe(false);
  });

  it("Bubbles/Sweet/Other/no style show every grape", () => {
    for (const style of ["bubbles", "sweet", "other", "", undefined] as const) {
      const options = singleGrapeVarietyOptionsForStyle(style);
      expect(options.length).toBe(GRAPE_VARIETIES.length);
    }
  });

  it("a White grape is compatible with White and incompatible with Red", () => {
    expect(isGrapeColorCompatibleWithStyle("Chardonnay", "white")).toBe(true);
    expect(isGrapeColorCompatibleWithStyle("Chardonnay", "red")).toBe(false);
  });

  it("a Red grape is compatible with Red and incompatible with White", () => {
    expect(isGrapeColorCompatibleWithStyle("Pinot Noir", "red")).toBe(true);
    expect(isGrapeColorCompatibleWithStyle("Pinot Noir", "white")).toBe(false);
  });

  it("any grape is compatible with a style that allows either colour", () => {
    expect(isGrapeColorCompatibleWithStyle("Chardonnay", "bubbles")).toBe(true);
    expect(isGrapeColorCompatibleWithStyle("Pinot Noir", "sweet")).toBe(true);
  });

  it("an unrecognised (custom) grape is always treated as compatible", () => {
    expect(isGrapeColorCompatibleWithStyle("Mondeuse Blanche", "white")).toBe(true);
    expect(isGrapeColorCompatibleWithStyle("Mondeuse Blanche", "red")).toBe(true);
  });
});

describe("singleGrapeVarietyOptionsPreservingCurrent — blind-guess draft safety net", () => {
  it("behaves identically to the plain filter when the current value is blank", () => {
    expect(singleGrapeVarietyOptionsPreservingCurrent("white", "")).toEqual(
      singleGrapeVarietyOptionsForStyle("white")
    );
  });

  it("behaves identically to the plain filter when the current value is already compatible", () => {
    expect(singleGrapeVarietyOptionsPreservingCurrent("white", "Chardonnay")).toEqual(
      singleGrapeVarietyOptionsForStyle("white")
    );
  });

  it("prepends an otherwise-filtered-out current value rather than dropping it", () => {
    const options = singleGrapeVarietyOptionsPreservingCurrent("white", "Pinot Noir");
    expect(options[0].value).toBe("Pinot Noir");
    expect(options.some((g) => g.skin === "white")).toBe(true);
  });

  it("never duplicates the current value if it's already present", () => {
    const options = singleGrapeVarietyOptionsPreservingCurrent("red", "Syrah");
    expect(options.filter((g) => g.value === "Syrah")).toHaveLength(1);
  });

  it("ignores an unrecognised current value (e.g. a custom Other-grape draft) rather than inventing an entry for it", () => {
    expect(singleGrapeVarietyOptionsPreservingCurrent("white", "Mondeuse Blanche")).toEqual(
      singleGrapeVarietyOptionsForStyle("white")
    );
  });

  it("is a no-op for all_skins-equivalent ('' or other) styles, since nothing is filtered out to begin with", () => {
    expect(singleGrapeVarietyOptionsPreservingCurrent("", "Pinot Noir")).toEqual(
      singleGrapeVarietyOptionsForStyle("")
    );
  });
});

describe("isCustomSingleGrape", () => {
  it("is false for a curated grape in single mode", () => {
    expect(isCustomSingleGrape("single", "Chardonnay")).toBe(false);
  });

  it("is false for a known alias in single mode", () => {
    expect(isCustomSingleGrape("single", "Shiraz")).toBe(false);
  });

  it("is true for an unrecognised grape name in single mode", () => {
    expect(isCustomSingleGrape("single", "Mondeuse Blanche")).toBe(true);
  });

  it("is false for a blank value", () => {
    expect(isCustomSingleGrape("single", "")).toBe(false);
    expect(isCustomSingleGrape("single", "   ")).toBe(false);
  });

  it("is false in blend mode regardless of content", () => {
    expect(isCustomSingleGrape("blend", "Mondeuse Blanche")).toBe(false);
  });

  it("is false when mode is unset", () => {
    expect(isCustomSingleGrape("", "Mondeuse Blanche")).toBe(false);
  });
});
