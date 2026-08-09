import { describe, expect, it } from "vitest";
import {
  buildCellarGroupKey,
  formatAvailableCountLabel,
  formatBottleCountLabel,
  formatCellarFormatLine,
  formatCellarGroupStatusLine,
  formatCellarOriginLine,
  groupCellarBottles,
  oldestBottleFirst,
} from "@/lib/cellarGrouping";
import { CellarBottleRow } from "@/lib/supabase/types";

let nextId = 1;

/**
 * `CellarBottleRow` has no `owner_user_id` at all (RLS already scopes every
 * fetch to `auth.uid()`) — every test below operates on rows that would
 * already come from one owner's own fetch, mirroring how the real app can
 * never even construct a cross-owner array to pass into these functions.
 */
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
    producer: "Domaine Example",
    wine_cuvee: "Village",
    bottle_format: "750ml",
    bottle_format_other: null,
    storage_location: "Rack A",
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

describe("groupCellarBottles", () => {
  it("groups identical Available bottles into one group with the correct count", () => {
    const rows = [makeRow(), makeRow(), makeRow()];
    const groups = groupCellarBottles(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].bottleCount).toBe(3);
    expect(groups[0].bottles).toHaveLength(3);
  });

  it("never groups different statuses", () => {
    const rows = [makeRow({ status: "available" }), makeRow({ status: "reserved" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different storage locations", () => {
    const rows = [makeRow({ storage_location: "Rack A" }), makeRow({ storage_location: "Fridge" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different bottle formats", () => {
    const rows = [makeRow({ bottle_format: "750ml" }), makeRow({ bottle_format: "1500ml" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different bottle_format_other detail when format is 'other'", () => {
    const rows = [
      makeRow({ bottle_format: "other", bottle_format_other: "Double magnum" }),
      makeRow({ bottle_format: "other", bottle_format_other: "Jeroboam" }),
    ];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different vintage values", () => {
    const rows = [makeRow({ vintage: "2021" }), makeRow({ vintage: "2022" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups NV with a blank vintage", () => {
    const rows = [makeRow({ vintage: "NV" }), makeRow({ vintage: "" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different producers", () => {
    const rows = [makeRow({ producer: "Domaine A" }), makeRow({ producer: "Domaine B" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different wine/cuvée names", () => {
    const rows = [makeRow({ wine_cuvee: "Village" }), makeRow({ wine_cuvee: "Premier Cru" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different countries", () => {
    const rows = [makeRow({ country: "France" }), makeRow({ country: "Italy" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different regions", () => {
    const rows = [makeRow({ region: "Burgundy" }), makeRow({ region: "Bordeaux" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different appellations", () => {
    const rows = [makeRow({ appellation: "Volnay" }), makeRow({ appellation: "Pommard" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different grape/blend text", () => {
    const rows = [makeRow({ grape_blend: "Pinot Noir" }), makeRow({ grape_blend: "Gamay" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different wine style/type", () => {
    const rows = [makeRow({ wine_style: "red" }), makeRow({ wine_style: "white" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups single-variety and blend rows, even with matching grape text", () => {
    const rows = [
      makeRow({ grape_blend_mode: "single", grape_blend: "Cabernet Sauvignon" }),
      makeRow({ grape_blend_mode: "blend", grape_blend: "Cabernet Sauvignon" }),
    ];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups materially different blend component lists", () => {
    const rows = [
      makeRow({
        grape_blend_mode: "blend",
        grape_blend: "Cabernet Sauvignon / Merlot",
        grape_blend_components: { selectedGrapes: ["Cabernet Sauvignon", "Merlot"], otherGrapesText: "" },
      }),
      makeRow({
        grape_blend_mode: "blend",
        grape_blend: "Cabernet Sauvignon / Merlot / Petit Verdot",
        grape_blend_components: {
          selectedGrapes: ["Cabernet Sauvignon", "Merlot", "Petit Verdot"],
          otherGrapesText: "",
        },
      }),
    ];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("never groups different custom Other-grape free text", () => {
    const rows = [
      makeRow({
        grape_blend_mode: "single",
        grape_blend: "Xarel·lo",
        grape_blend_components: { selectedGrapes: [], otherGrapesText: "Xarel·lo" },
      }),
      makeRow({
        grape_blend_mode: "single",
        grape_blend: "Assyrtiko",
        grape_blend_components: { selectedGrapes: [], otherGrapesText: "Assyrtiko" },
      }),
    ];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("groups identical blend rows despite differently-ordered selected grapes", () => {
    const rows = [
      makeRow({
        grape_blend_mode: "blend",
        grape_blend: "Cabernet Sauvignon / Merlot",
        grape_blend_components: { selectedGrapes: ["Cabernet Sauvignon", "Merlot"], otherGrapesText: "" },
      }),
      makeRow({
        grape_blend_mode: "blend",
        grape_blend: "Cabernet Sauvignon / Merlot",
        grape_blend_components: { selectedGrapes: ["Merlot", "Cabernet Sauvignon"], otherGrapesText: "" },
      }),
    ];
    expect(groupCellarBottles(rows)).toHaveLength(1);
  });

  it("groups values that only differ by case or surrounding/repeated whitespace", () => {
    const rows = [makeRow({ producer: "Domaine Example" }), makeRow({ producer: "  domaine   example  " })];
    expect(groupCellarBottles(rows)).toHaveLength(1);
  });

  it("does not use fuzzy accent-insensitive matching for grouping", () => {
    const rows = [makeRow({ producer: "Château Example" }), makeRow({ producer: "Chateau Example" })];
    expect(groupCellarBottles(rows)).toHaveLength(2);
  });

  it("groups rows with different personal notes, and preserves every note unchanged", () => {
    const rows = [makeRow({ personal_note: "Gift from Alex" }), makeRow({ personal_note: "Bought in Beaune" })];
    const groups = groupCellarBottles(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].bottles.map((b) => b.personal_note).sort()).toEqual(["Bought in Beaune", "Gift from Alex"]);
  });

  it("excludes notes/underlying-record composition from the group DTO's display surface", () => {
    const group = groupCellarBottles([makeRow({ personal_note: "Secret note" })])[0];
    // The representative is a real row (reused, not duplicated), but nothing
    // this module exports ever formats or surfaces personal_note — see
    // formatCellarOriginLine / formatCellarFormatLine / status-line helpers.
    expect(formatCellarOriginLine(group.representative)).not.toContain("Secret note");
    expect(formatCellarFormatLine(group.representative)).not.toContain("Secret note");
  });

  it("preserves input order for each group's first appearance", () => {
    const rows = [makeRow({ producer: "B" }), makeRow({ producer: "A" }), makeRow({ producer: "B" })];
    const groups = groupCellarBottles(rows);
    expect(groups.map((g) => g.representative.producer)).toEqual(["B", "A"]);
  });
});

describe("buildCellarGroupKey", () => {
  it("is stable for the same input", () => {
    const row = makeRow();
    expect(buildCellarGroupKey(row)).toBe(buildCellarGroupKey({ ...row, id: "different-id" }));
  });
});

describe("oldestBottleFirst", () => {
  it("orders by created_at ascending, then id as a stable tie-breaker", () => {
    const older = makeRow({ id: "b", created_at: "2025-01-01T00:00:00.000Z" });
    const newer = makeRow({ id: "a", created_at: "2025-06-01T00:00:00.000Z" });
    const sameTimeA = makeRow({ id: "z", created_at: "2025-03-01T00:00:00.000Z" });
    const sameTimeB = makeRow({ id: "y", created_at: "2025-03-01T00:00:00.000Z" });

    const ordered = oldestBottleFirst([newer, sameTimeA, older, sameTimeB]);
    expect(ordered.map((r) => r.id)).toEqual(["b", "y", "z", "a"]);
  });
});

describe("formatBottleCountLabel", () => {
  it("uses singular/plural grammar, never Qty/x6/6x/6 units", () => {
    expect(formatBottleCountLabel(1)).toBe("1 bottle");
    expect(formatBottleCountLabel(2)).toBe("2 bottles");
    expect(formatBottleCountLabel(6)).toBe("6 bottles");
  });
});

describe("formatAvailableCountLabel", () => {
  it("uses singular/plural grammar for the picker", () => {
    expect(formatAvailableCountLabel(1)).toBe("1 bottle available");
    expect(formatAvailableCountLabel(6)).toBe("6 bottles available");
  });
});

describe("formatCellarGroupStatusLine", () => {
  it("formats Available with a plain count", () => {
    expect(formatCellarGroupStatusLine("available", 6)).toBe("Available · 6 bottles");
  });

  it("formats Reserved without naming a specific tasting", () => {
    expect(formatCellarGroupStatusLine("reserved", 2)).toBe("Reserved for tasting · 2 bottles");
  });

  it("formats Consumed with singular grammar", () => {
    expect(formatCellarGroupStatusLine("consumed", 1)).toBe("Consumed · 1 bottle");
  });
});

describe("formatCellarOriginLine", () => {
  it("omits appellation when absent and never duplicates region/country", () => {
    const row = makeRow({ vintage: "2022", appellation: null, region: "Burgundy", country: "France" });
    expect(formatCellarOriginLine(row)).toBe("2022 · Burgundy · France");
  });

  it("puts appellation before region when present", () => {
    const row = makeRow({ vintage: "NV", appellation: "Chablis", region: "Burgundy", country: "France" });
    expect(formatCellarOriginLine(row)).toBe("NV · Chablis, Burgundy · France");
  });
});

describe("formatCellarFormatLine", () => {
  it("combines format and storage location", () => {
    const row = makeRow({ bottle_format: "750ml", bottle_format_other: null, storage_location: "Rack A" });
    expect(formatCellarFormatLine(row)).toBe("750ml (standard) · Rack A");
  });

  it("omits storage location cleanly when unset", () => {
    const row = makeRow({ bottle_format: "750ml", bottle_format_other: null, storage_location: null });
    expect(formatCellarFormatLine(row)).toBe("750ml (standard)");
  });
});
