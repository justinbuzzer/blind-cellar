import { describe, expect, it } from "vitest";
import {
  ALL_FILTER_VALUE,
  applyCellarFilters,
  computeCellarFilterOptions,
  DEFAULT_CELLAR_FILTERS,
  hasActiveCellarFilters,
  updateCellarFilter,
} from "@/lib/cellarFilters";
import { groupCellarBottles } from "@/lib/cellarGrouping";
import { CellarBottleRow } from "@/lib/supabase/types";

let nextId = 1;

function makeRow(overrides: Partial<CellarBottleRow> = {}): CellarBottleRow {
  const id = `cellar-${nextId++}`;
  return {
    id,
    wine_style: "red",
    country: "France",
    region: "Burgundy",
    appellation: null,
    grape_blend_mode: "single",
    grape_blend: "Pinot Noir",
    grape_blend_components: null,
    vintage: "2022",
    producer: `Producer ${id}`,
    wine_cuvee: "Village",
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
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const sampleRows: CellarBottleRow[] = [
  makeRow({ wine_style: "red", country: "France", region: "Burgundy", appellation: "Volnay" }),
  makeRow({ wine_style: "red", country: "France", region: "Bordeaux", appellation: null }),
  makeRow({ wine_style: "white", country: "France", region: "Burgundy", appellation: "Chablis" }),
  makeRow({ wine_style: "white", country: "Italy", region: "Piedmont", appellation: null }),
  makeRow({ wine_style: "red", country: "Italy", region: "Piedmont", appellation: "Barolo" }),
];
const sampleGroups = groupCellarBottles(sampleRows);

describe("computeCellarFilterOptions", () => {
  it("Type options reflect every canonical style present, in canonical order", () => {
    const options = computeCellarFilterOptions(sampleGroups, DEFAULT_CELLAR_FILTERS);
    expect(options.types.map((o) => o.value)).toEqual(["white", "red"]);
  });

  it("Country options are scoped by the active Type", () => {
    const options = computeCellarFilterOptions(sampleGroups, { ...DEFAULT_CELLAR_FILTERS, type: "white" });
    expect(options.countries.map((o) => o.value).sort()).toEqual(["France", "Italy"]);
  });

  it("Country options exclude countries that don't match the active Type", () => {
    // Only Italy has a "white" Piedmont row and a "red" Piedmont/Barolo row —
    // filtering Type=red should still surface both France and Italy since
    // both have red rows, but never a country that has *only* white rows.
    const onlyWhiteCountryRows = groupCellarBottles([
      makeRow({ wine_style: "white", country: "Germany", region: "Mosel" }),
    ]);
    const options = computeCellarFilterOptions(
      [...sampleGroups, ...onlyWhiteCountryRows],
      { ...DEFAULT_CELLAR_FILTERS, type: "red" }
    );
    expect(options.countries.map((o) => o.value)).not.toContain("Germany");
  });

  it("Region options cascade from Type and Country", () => {
    const options = computeCellarFilterOptions(sampleGroups, {
      ...DEFAULT_CELLAR_FILTERS,
      type: "red",
      country: "France",
    });
    expect(options.regions.map((o) => o.value).sort()).toEqual(["Bordeaux", "Burgundy"]);
  });

  it("Appellation options cascade from Type, Country, and Region, and exclude blanks", () => {
    const options = computeCellarFilterOptions(sampleGroups, {
      ...DEFAULT_CELLAR_FILTERS,
      type: "red",
      country: "France",
      region: "Burgundy",
    });
    expect(options.appellations.map((o) => o.value)).toEqual(["Volnay"]);
  });

  it("never shows a blank/null region or appellation as a selectable option", () => {
    const options = computeCellarFilterOptions(sampleGroups, DEFAULT_CELLAR_FILTERS);
    expect(options.regions.some((o) => o.value === "")).toBe(false);
    expect(options.appellations.some((o) => o.value === "")).toBe(false);
  });

  it("labels an ambiguous region with its countries, but keeps the value as the plain region string", () => {
    const rows = [
      makeRow({ region: "Valencia", country: "Spain" }),
      makeRow({ region: "Valencia", country: "United States" }),
    ];
    const options = computeCellarFilterOptions(groupCellarBottles(rows), DEFAULT_CELLAR_FILTERS);
    const valencia = options.regions.find((o) => o.value === "Valencia");
    expect(valencia?.label).toBe("Valencia — Spain / United States");
  });

  it("does not disambiguate a region's label when only one country uses it", () => {
    const options = computeCellarFilterOptions(sampleGroups, DEFAULT_CELLAR_FILTERS);
    const burgundy = options.regions.find((o) => o.value === "Burgundy");
    expect(burgundy?.label).toBe("Burgundy");
  });

  it("labels an ambiguous appellation with its region/country context", () => {
    const rows = [
      makeRow({ country: "France", region: "Burgundy", appellation: "Volnay" }),
      makeRow({ country: "Italy", region: "Tuscany", appellation: "Volnay" }),
    ];
    const options = computeCellarFilterOptions(groupCellarBottles(rows), DEFAULT_CELLAR_FILTERS);
    const volnay = options.appellations.find((o) => o.value === "Volnay");
    expect(volnay?.label).toBe("Volnay — Burgundy, France / Tuscany, Italy");
  });
});

describe("applyCellarFilters", () => {
  it("combines all four dimensions with AND semantics", () => {
    const visible = applyCellarFilters(sampleGroups, {
      type: "red",
      country: "France",
      region: "Burgundy",
      appellation: "Volnay",
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].representative.appellation).toBe("Volnay");
  });

  it("returns every group when every filter is 'all'", () => {
    expect(applyCellarFilters(sampleGroups, DEFAULT_CELLAR_FILTERS)).toHaveLength(sampleGroups.length);
  });

  it("returns no groups when a combination matches nothing", () => {
    const visible = applyCellarFilters(sampleGroups, {
      type: "white",
      country: "France",
      region: "Bordeaux",
      appellation: ALL_FILTER_VALUE,
    });
    expect(visible).toHaveLength(0);
  });
});

describe("updateCellarFilter", () => {
  it("resets Country/Region/Appellation only when they become invalid for the new Type", () => {
    const start = { type: ALL_FILTER_VALUE, country: "Italy", region: "Piedmont", appellation: "Barolo" };
    // Italy/Piedmont/Barolo is only ever "red" in the sample data, so
    // switching to Type=red should keep every one of them.
    const afterRed = updateCellarFilter(sampleGroups, start, "type", "red");
    expect(afterRed).toEqual({ type: "red", country: "Italy", region: "Piedmont", appellation: "Barolo" });

    // Switching to Type=white instead keeps Country/Region (Italy/Piedmont
    // both still have a *white* row in the sample data) but resets
    // Appellation, since "Barolo" only exists on the red row.
    const afterWhite = updateCellarFilter(sampleGroups, start, "type", "white");
    expect(afterWhite).toEqual({
      type: "white",
      country: "Italy",
      region: "Piedmont",
      appellation: ALL_FILTER_VALUE,
    });
  });

  it("resets Region/Appellation only when they become invalid for the new Country", () => {
    const start = { type: ALL_FILTER_VALUE, country: ALL_FILTER_VALUE, region: "Bordeaux", appellation: ALL_FILTER_VALUE };
    const afterItaly = updateCellarFilter(sampleGroups, start, "country", "Italy");
    expect(afterItaly.region).toBe(ALL_FILTER_VALUE);
  });

  it("resets Appellation only when it becomes invalid for the new Region", () => {
    const start = { type: ALL_FILTER_VALUE, country: "France", region: ALL_FILTER_VALUE, appellation: "Volnay" };
    const afterBordeaux = updateCellarFilter(sampleGroups, start, "region", "Bordeaux");
    expect(afterBordeaux.appellation).toBe(ALL_FILTER_VALUE);

    const afterBurgundy = updateCellarFilter(sampleGroups, start, "region", "Burgundy");
    expect(afterBurgundy.appellation).toBe("Volnay");
  });

  it("never modifies parent filters when Appellation changes", () => {
    const start = { type: "red", country: "France", region: "Burgundy", appellation: ALL_FILTER_VALUE };
    const next = updateCellarFilter(sampleGroups, start, "appellation", "Volnay");
    expect(next).toEqual({ type: "red", country: "France", region: "Burgundy", appellation: "Volnay" });
  });

  it("never leaves a dependent filter selected with zero valid options", () => {
    // "Barolo" only exists on a red row in the sample data — switching to
    // Type=white must reset it to "all" rather than leaving it selected
    // against an appellation list that no longer contains it.
    const start = { type: ALL_FILTER_VALUE, country: ALL_FILTER_VALUE, region: ALL_FILTER_VALUE, appellation: "Barolo" };
    const next = updateCellarFilter(sampleGroups, start, "type", "white");
    expect(next.appellation).toBe(ALL_FILTER_VALUE);
    const options = computeCellarFilterOptions(sampleGroups, next);
    expect(options.appellations.some((o) => o.value === "Barolo")).toBe(false);
  });
});

describe("hasActiveCellarFilters", () => {
  it("is false only when every filter is at its default", () => {
    expect(hasActiveCellarFilters(DEFAULT_CELLAR_FILTERS)).toBe(false);
    expect(hasActiveCellarFilters({ ...DEFAULT_CELLAR_FILTERS, type: "red" })).toBe(true);
  });
});
