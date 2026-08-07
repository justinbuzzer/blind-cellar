import { describe, expect, it } from "vitest";
import {
  compactWineLocationLabel,
  getAppellations,
  hasAppellations,
  isValidAppellation,
} from "@/lib/appellations";
import { GRAPE_VARIETIES, REGIONS_BY_COUNTRY } from "@/lib/wineReferenceData";

describe("getAppellations", () => {
  it("returns the Burgundy list including Chablis", () => {
    const appellations = getAppellations("France", "Burgundy");
    expect(appellations).toContain("Chablis");
    expect(appellations.length).toBeGreaterThan(10);
  });

  it("returns the Piedmont list including Barolo and Barbaresco", () => {
    const appellations = getAppellations("Italy", "Piedmont");
    expect(appellations).toContain("Barolo");
    expect(appellations).toContain("Barbaresco");
  });

  it("returns an empty list for an unsupported country/region pair", () => {
    expect(getAppellations("Greece", "Crete")).toEqual([]);
  });

  it("returns an empty list for a completely unknown country", () => {
    expect(getAppellations("Nowhere", "Nowhere Region")).toEqual([]);
  });

  it("normalizes whitespace and case when matching", () => {
    expect(getAppellations("  france ", " BURGUNDY ")).toContain("Chablis");
  });

  it("United States/Oregon contains Willamette Valley", () => {
    expect(getAppellations("United States", "Oregon")).toContain("Willamette Valley");
  });

  it("United States/California does not contain Willamette Valley", () => {
    expect(getAppellations("United States", "California")).not.toContain("Willamette Valley");
  });
});

describe("hasAppellations", () => {
  it("is true for a supported pair", () => {
    expect(hasAppellations("France", "Burgundy")).toBe(true);
  });

  it("is false for an unsupported pair", () => {
    expect(hasAppellations("Greece", "Crete")).toBe(false);
  });
});

describe("isValidAppellation", () => {
  it("a blank appellation is always valid, even for an unsupported pair", () => {
    expect(isValidAppellation("Greece", "Crete", "")).toBe(true);
    expect(isValidAppellation("Greece", "Crete", "   ")).toBe(true);
  });

  it("accepts a curated appellation for its region", () => {
    expect(isValidAppellation("Italy", "Piedmont", "Barolo")).toBe(true);
  });

  it("rejects an appellation that belongs to a different region", () => {
    expect(isValidAppellation("France", "Burgundy", "Barolo")).toBe(false);
  });

  it("rejects any non-blank appellation for an unsupported pair", () => {
    expect(isValidAppellation("Greece", "Crete", "Chablis")).toBe(false);
  });
});

describe("curated map data quality", () => {
  it("every supported region is a real option in REGIONS_BY_COUNTRY", () => {
    // Spot-checks the pairs most likely to drift: Spain and Australia both
    // needed additive region-list corrections for their appellation pairs
    // to be reachable through the actual dropdown — see lib/appellations.ts.
    expect(REGIONS_BY_COUNTRY.Spain).toContain("La Rioja");
    expect(REGIONS_BY_COUNTRY.Spain).toContain("Jerez");
    expect(REGIONS_BY_COUNTRY.Australia).toContain("South Australia");
    expect(REGIONS_BY_COUNTRY.Australia).toContain("Victoria");
    expect(REGIONS_BY_COUNTRY.Australia).toContain("Western Australia");
    expect(REGIONS_BY_COUNTRY.Australia).toContain("New South Wales");
    expect(getAppellations("Spain", "La Rioja")).toContain("Rioja Alta");
    expect(getAppellations("Spain", "Jerez")).toContain("Jerez-Xérès-Sherry");
    expect(getAppellations("Australia", "South Australia")).toContain("Barossa Valley");
  });

  it("has no duplicate appellation values within any single country/region pair", () => {
    // The module itself throws at import time (dev-only) if this is ever
    // violated — this test just documents/pins that guarantee explicitly.
    const pairs: [string, string][] = [
      ["France", "Burgundy"],
      ["France", "Bordeaux"],
      ["Italy", "Piedmont"],
      ["Spain", "La Rioja"],
      ["United States", "California"],
      ["Australia", "South Australia"],
    ];
    for (const [country, region] of pairs) {
      const appellations = getAppellations(country, region);
      expect(new Set(appellations).size).toBe(appellations.length);
    }
  });

  it("introduces no grape data — no appellation value collides with a curated grape variety", () => {
    const grapeNames = new Set(GRAPE_VARIETIES.map((g) => g.value.toLowerCase()));
    const allAppellations = [
      ...getAppellations("France", "Burgundy"),
      ...getAppellations("Italy", "Piedmont"),
      ...getAppellations("Spain", "La Rioja"),
      ...getAppellations("United States", "California"),
    ];
    for (const appellation of allAppellations) {
      expect(grapeNames.has(appellation.toLowerCase())).toBe(false);
    }
  });
});

describe("compactWineLocationLabel", () => {
  it("orders as appellation, region, country", () => {
    expect(
      compactWineLocationLabel({ appellation: "Chablis", region: "Burgundy", country: "France" })
    ).toBe("Chablis, Burgundy, France");
  });

  it("omits a missing appellation cleanly", () => {
    expect(compactWineLocationLabel({ appellation: null, region: "Burgundy", country: "France" })).toBe(
      "Burgundy, France"
    );
  });

  it("omits a missing region and country cleanly", () => {
    expect(compactWineLocationLabel({ appellation: "Chablis", region: null, country: null })).toBe(
      "Chablis"
    );
  });

  it("does not duplicate when region and appellation share the same display text", () => {
    expect(
      compactWineLocationLabel({ appellation: "Champagne", region: "Champagne", country: "France" })
    ).toBe("Champagne, France");
  });

  it("returns an empty string when everything is missing", () => {
    expect(compactWineLocationLabel({})).toBe("");
  });
});
