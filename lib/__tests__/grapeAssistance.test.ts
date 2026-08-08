import { describe, expect, it } from "vitest";
import {
  evaluateGrapeAssistanceChange,
  GRAPE_ASSISTANCE_APPLIED_MESSAGE,
  GRAPE_DETAILS_CLEARED_MESSAGE,
  GRAPE_STYLE_CLEARED_MESSAGE,
  GrapeAssistanceGrapeFields,
  GrapeAssistanceTriggerFields,
  GrapeValueSource,
  getGrapeAssistance,
  isGrapeValueEmpty,
  styleFilterKeyForHint,
} from "@/lib/grapeAssistance";
import { isKnownGrapeVariety } from "@/lib/wineReferenceData";

function emptyGrape(overrides: Partial<GrapeAssistanceGrapeFields> = {}): GrapeAssistanceGrapeFields {
  return {
    grapeBlendMode: "single",
    grapeBlend: "",
    selectedGrapes: [],
    otherGrapesText: "",
    otherGrapeSelected: false,
    ...overrides,
  };
}

function triggers(overrides: Partial<GrapeAssistanceTriggerFields> = {}): GrapeAssistanceTriggerFields {
  return { wineStyle: "", country: "", region: "", appellation: "", ...overrides };
}

describe("getGrapeAssistance — lookup precedence", () => {
  it("returns null for an unsupported combination", () => {
    expect(getGrapeAssistance({ country: "Narnia", region: "Nowhere" })).toBeNull();
  });

  it("returns null with no region (never maps on country alone)", () => {
    expect(getGrapeAssistance({ country: "France", region: "" })).toBeNull();
  });

  it("Burgundy + White auto-selects single Chardonnay (region + style tier)", () => {
    expect(getGrapeAssistance({ country: "France", region: "Burgundy", wineStyle: "white" })).toEqual({
      kind: "single",
      grapes: ["Chardonnay"],
    });
  });

  it("Burgundy + Red auto-selects single Pinot Noir (region + style tier)", () => {
    expect(getGrapeAssistance({ country: "France", region: "Burgundy", wineStyle: "red" })).toEqual({
      kind: "single",
      grapes: ["Pinot Noir"],
    });
  });

  it("does not apply the Burgundy region-level mapping when wine style is missing", () => {
    expect(getGrapeAssistance({ country: "France", region: "Burgundy" })).toBeNull();
  });

  it("Chablis (appellation, no style) beats the Burgundy region+style tier", () => {
    const match = getGrapeAssistance({
      country: "France",
      region: "Burgundy",
      appellation: "Chablis",
      wineStyle: "red", // deliberately conflicting style — appellation tier must still win
    });
    expect(match).toEqual({ kind: "single", grapes: ["Chardonnay"] });
  });

  it("an unmatched appellation+style falls through to the region+style tier normally, per the stated precedence", () => {
    // Marsannay is only mapped with "+ Red" (tier 1) — there is no
    // appellation-only (tier 2) entry for it. A mismatched style ("+ White")
    // must fall through to Burgundy's own region+style tier (Chardonnay),
    // exactly as the spec requires ("use the stated precedence normally"),
    // not resolve to null.
    expect(
      getGrapeAssistance({ country: "France", region: "Burgundy", appellation: "Marsannay", wineStyle: "white" })
    ).toEqual({ kind: "single", grapes: ["Chardonnay"] });
    expect(
      getGrapeAssistance({ country: "France", region: "Burgundy", appellation: "Marsannay", wineStyle: "red" })
    ).toEqual({ kind: "single", grapes: ["Pinot Noir"] });
  });

  it("appellation tier (2) beats region+style tier (3) even when style also matches", () => {
    // Meursault (tier 2, no style attached) sits under a region that also
    // has its own region+style (tier 3) White mapping to the same grape —
    // proving the appellation tier is consulted and wins before the region
    // tier is ever considered, not merely "happens to agree."
    expect(
      getGrapeAssistance({ country: "France", region: "Burgundy", appellation: "Meursault", wineStyle: "white" })
    ).toEqual({ kind: "single", grapes: ["Chardonnay"] });
  });

  it("does not apply an appellation-specific mapping when appellation is blank", () => {
    expect(
      getGrapeAssistance({ country: "France", region: "Burgundy", appellation: "", wineStyle: "white" })
    ).toEqual({ kind: "single", grapes: ["Chardonnay"] }); // falls through to region+style, not Chablis
  });

  it("Barolo auto-selects single Nebbiolo", () => {
    expect(getGrapeAssistance({ country: "Italy", region: "Piedmont", appellation: "Barolo" })).toEqual({
      kind: "single",
      grapes: ["Nebbiolo"],
    });
  });

  it("Bordeaux + Red resolves to the Cabernet/Merlot/Cabernet Franc blend", () => {
    expect(getGrapeAssistance({ country: "France", region: "Bordeaux", wineStyle: "red" })).toEqual({
      kind: "blend",
      grapes: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"],
    });
  });

  it("Champagne + Bubbles resolves to the region-level blend", () => {
    expect(getGrapeAssistance({ country: "France", region: "Champagne", wineStyle: "bubbles" })).toEqual({
      kind: "blend",
      grapes: ["Chardonnay", "Pinot Noir", "Pinot Meunier"],
    });
  });

  it("the Champagne appellation itself matches regardless of style", () => {
    expect(
      getGrapeAssistance({ country: "France", region: "Champagne", appellation: "Champagne", wineStyle: "sweet" })
    ).toEqual({ kind: "blend", grapes: ["Chardonnay", "Pinot Noir", "Pinot Meunier"] });
  });

  it("Paso Robles + White is deliberately left unmapped", () => {
    expect(
      getGrapeAssistance({ country: "United States", region: "California", appellation: "Paso Robles", wineStyle: "white" })
    ).toBeNull();
  });

  it("no unsupported 'no automatic selection' region ever receives a mapping (Alsace, Pfalz, Wachau, Menfi, Riverina)", () => {
    expect(getGrapeAssistance({ country: "France", region: "Alsace", appellation: "Alsace" })).toBeNull();
    expect(getGrapeAssistance({ country: "France", region: "Alsace", appellation: "Alsace Grand Cru" })).toBeNull();
    expect(getGrapeAssistance({ country: "Germany", region: "Pfalz" })).toBeNull();
    expect(getGrapeAssistance({ country: "Austria", region: "Wachau" })).toBeNull();
    expect(getGrapeAssistance({ country: "Italy", region: "Sicily", appellation: "Menfi" })).toBeNull();
    expect(getGrapeAssistance({ country: "Australia", region: "New South Wales", appellation: "Riverina" })).toBeNull();
  });

  it("does not map California/Willamette Valley — Willamette Valley is Oregon's appellation, not California's", () => {
    expect(
      getGrapeAssistance({ country: "United States", region: "California", appellation: "Willamette Valley" })
    ).toBeNull();
    expect(
      getGrapeAssistance({ country: "United States", region: "Oregon", appellation: "Willamette Valley" })
    ).toEqual({ kind: "single", grapes: ["Pinot Noir"] });
  });

  it("no mapping ever uses the 'Other grape' sentinel and every mapped grape is a known standard variety", () => {
    // Exercised indirectly here; the exhaustive check lives in the module's
    // own dev-time validation (throws at import time if violated) — this
    // test just pins a couple of concrete, easy-to-eyeball examples.
    const single = getGrapeAssistance({ country: "Italy", region: "Piedmont", appellation: "Barolo" });
    const blend = getGrapeAssistance({ country: "France", region: "Bordeaux", wineStyle: "red" });
    for (const grape of [...(single?.grapes ?? []), ...(blend?.grapes ?? [])]) {
      expect(isKnownGrapeVariety(grape)).toBe(true);
      expect(grape).not.toBe("Other grape");
    }
  });

  it("every single-kind result has exactly one grape and every blend-kind result has at least two", () => {
    const cases: Array<[string, string, string | undefined, string | undefined]> = [
      ["Italy", "Piedmont", "Barolo", undefined],
      ["France", "Bordeaux", undefined, "red"],
      ["Spain", "Ribera del Duero", undefined, undefined],
      ["France", "Rhône Valley", "Côte-Rôtie", undefined],
    ];
    for (const [country, region, appellation, wineStyle] of cases) {
      const match = getGrapeAssistance({ country, region, appellation, wineStyle });
      expect(match).not.toBeNull();
      if (match?.kind === "single") expect(match.grapes.length).toBe(1);
      if (match?.kind === "blend") expect(match.grapes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("is safe against whitespace and casing", () => {
    expect(getGrapeAssistance({ country: "  france  ", region: "burgundy", wineStyle: "WHITE" })).toEqual({
      kind: "single",
      grapes: ["Chardonnay"],
    });
  });
});

describe("isGrapeValueEmpty", () => {
  it("is true for a blank single-mode value", () => {
    expect(isGrapeValueEmpty(emptyGrape())).toBe(true);
  });

  it("is false once a single grape is chosen", () => {
    expect(isGrapeValueEmpty(emptyGrape({ grapeBlend: "Chardonnay" }))).toBe(false);
  });

  it("is false for a custom Other-grape entry with text", () => {
    expect(isGrapeValueEmpty(emptyGrape({ otherGrapeSelected: true, grapeBlend: "Mondeuse" }))).toBe(false);
  });

  it("is true for Other-grape selected with no text yet", () => {
    expect(isGrapeValueEmpty(emptyGrape({ otherGrapeSelected: true, grapeBlend: "" }))).toBe(true);
  });

  it("is true for a blend mode with nothing picked", () => {
    expect(isGrapeValueEmpty(emptyGrape({ grapeBlendMode: "blend" }))).toBe(true);
  });

  it("is false once a blend has a selected grape or other-grapes text", () => {
    expect(isGrapeValueEmpty(emptyGrape({ grapeBlendMode: "blend", selectedGrapes: ["Merlot"] }))).toBe(false);
    expect(isGrapeValueEmpty(emptyGrape({ grapeBlendMode: "blend", otherGrapesText: "Carignan" }))).toBe(false);
  });
});

describe("evaluateGrapeAssistanceChange — auto-apply state machine", () => {
  it("returns null when no trigger field actually changed", () => {
    const t = triggers({ country: "France", region: "Burgundy" });
    expect(evaluateGrapeAssistanceChange(t, { ...t, ...emptyGrape() }, "empty")).toBeNull();
  });

  it("empty + matching single mapping auto-applies it", () => {
    const prev = triggers({ country: "France", region: "" });
    const current = triggers({ country: "France", region: "Burgundy", wineStyle: "white" });
    const outcome = evaluateGrapeAssistanceChange(prev, { ...current, ...emptyGrape() }, "empty");
    expect(outcome).toEqual({
      fields: {
        grapeBlendMode: "single",
        grapeBlend: "Chardonnay",
        selectedGrapes: [],
        otherGrapesText: "",
        otherGrapeSelected: false,
      },
      source: "auto",
      message: GRAPE_ASSISTANCE_APPLIED_MESSAGE,
    });
  });

  it("empty + matching blend mapping auto-applies it and switches mode", () => {
    const prev = triggers({ country: "France", region: "Bordeaux" });
    const current = triggers({ country: "France", region: "Bordeaux", wineStyle: "red" });
    const outcome = evaluateGrapeAssistanceChange(prev, { ...current, ...emptyGrape() }, "empty");
    expect(outcome?.fields.grapeBlendMode).toBe("blend");
    expect(outcome?.fields.selectedGrapes).toEqual(["Cabernet Sauvignon", "Merlot", "Cabernet Franc"]);
    expect(outcome?.source).toBe("auto");
  });

  it("auto source recomputes on a further location change", () => {
    const prev = triggers({ country: "France", region: "Burgundy", wineStyle: "white" });
    const current = triggers({ country: "France", region: "Burgundy", wineStyle: "white", appellation: "Chablis" });
    const currentGrape = emptyGrape({ grapeBlendMode: "single", grapeBlend: "Chardonnay" });
    const outcome = evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "auto");
    expect(outcome?.fields.grapeBlend).toBe("Chardonnay");
    expect(outcome?.source).toBe("auto");
  });

  it("auto single switches to auto blend when the mapping changes accordingly", () => {
    const prev = triggers({ country: "France", region: "Rhône Valley", appellation: "Cornas" });
    const current = triggers({ country: "France", region: "Rhône Valley", appellation: "Côte-Rôtie" });
    const currentGrape = emptyGrape({ grapeBlendMode: "single", grapeBlend: "Syrah" });
    const outcome = evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "auto");
    expect(outcome?.fields.grapeBlendMode).toBe("blend");
    expect(outcome?.fields.selectedGrapes).toEqual(["Syrah", "Viognier"]);
  });

  it("auto blend switches to auto single when the mapping changes accordingly", () => {
    const prev = triggers({ country: "France", region: "Rhône Valley", appellation: "Côte-Rôtie" });
    const current = triggers({ country: "France", region: "Rhône Valley", appellation: "Cornas" });
    const currentGrape = emptyGrape({ grapeBlendMode: "blend", selectedGrapes: ["Syrah", "Viognier"] });
    const outcome = evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "auto");
    expect(outcome?.fields.grapeBlendMode).toBe("single");
    expect(outcome?.fields.grapeBlend).toBe("Syrah");
  });

  it("clears an auto value when the new location/style combination has no mapping", () => {
    // wineStyle deliberately unchanged here, isolating this from the Part 1
    // colour-incompatibility path (covered separately below) — Langhe with
    // no style has no tier-2/3/4 mapping at all, so this exercises the
    // "auto -> no match -> clear" path on its own.
    const prev = triggers({ country: "Italy", region: "Piedmont", appellation: "Barolo" });
    const current = triggers({ country: "Italy", region: "Piedmont", appellation: "Langhe" });
    const currentGrape = emptyGrape({ grapeBlendMode: "single", grapeBlend: "Nebbiolo" });
    const outcome = evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "auto");
    expect(outcome).toEqual({
      fields: emptyGrape(),
      source: "empty",
      message: GRAPE_DETAILS_CLEARED_MESSAGE,
    });
  });

  it("a manual single selection is never overwritten by a subsequent location change", () => {
    const prev = triggers({ country: "France", region: "Burgundy", wineStyle: "white" });
    const current = triggers({ country: "France", region: "Burgundy", wineStyle: "white", appellation: "Chablis" });
    const currentGrape = emptyGrape({ grapeBlendMode: "single", grapeBlend: "Sauvignon Blanc" });
    expect(evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "manual")).toBeNull();
  });

  it("a manual custom Other-grape entry is never overwritten by a subsequent mapping change", () => {
    const prev = triggers({ country: "Italy", region: "Piedmont" });
    const current = triggers({ country: "Italy", region: "Piedmont", appellation: "Barolo" });
    const currentGrape = emptyGrape({ otherGrapeSelected: true, grapeBlend: "Mondeuse Blanche" });
    expect(evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "manual")).toBeNull();
  });

  it("a manual blend is never overwritten by a subsequent mapping change", () => {
    const prev = triggers({ country: "France", region: "Bordeaux" });
    const current = triggers({ country: "France", region: "Bordeaux", wineStyle: "red" });
    const currentGrape = emptyGrape({ grapeBlendMode: "blend", selectedGrapes: ["Malbec", "Merlot"] });
    expect(evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "manual")).toBeNull();
  });

  it("does not apply a mapping over an empty field with no matching mapping", () => {
    const prev = triggers({ country: "Narnia", region: "" });
    const current = triggers({ country: "Narnia", region: "Nowhere" });
    expect(evaluateGrapeAssistanceChange(prev, { ...current, ...emptyGrape() }, "empty")).toBeNull();
  });

  it("colour-incompatible single grape is cleared on a style change, even when manually chosen", () => {
    const prev = triggers({ country: "France", region: "Burgundy", wineStyle: "white" });
    const current = triggers({ country: "France", region: "Burgundy", wineStyle: "red" });
    const currentGrape = emptyGrape({ grapeBlendMode: "single", grapeBlend: "Chardonnay" });
    const outcome = evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "manual");
    expect(outcome).toEqual({ fields: emptyGrape(), source: "empty", message: GRAPE_STYLE_CLEARED_MESSAGE });
  });

  it("colour-incompatible single grape is cleared on a style change when auto-sourced too", () => {
    const prev = triggers({ country: "France", region: "Burgundy", wineStyle: "red" });
    const current = triggers({ country: "France", region: "Burgundy", wineStyle: "white" });
    const currentGrape = emptyGrape({ grapeBlendMode: "single", grapeBlend: "Pinot Noir" });
    const outcome = evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "auto");
    expect(outcome?.source).toBe("empty");
    expect(outcome?.message).toBe(GRAPE_STYLE_CLEARED_MESSAGE);
  });

  it("a colour-compatible single grape is left alone across a style change", () => {
    const prev = triggers({ country: "France", region: "Burgundy", wineStyle: "" });
    const current = triggers({ country: "France", region: "Burgundy", wineStyle: "white" });
    const currentGrape = emptyGrape({ grapeBlendMode: "single", grapeBlend: "Chardonnay" });
    expect(evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "manual")).toBeNull();
  });

  it("a custom Other-grape entry is never cleared by a style change (no known colour)", () => {
    const prev = triggers({ country: "France", region: "Burgundy", wineStyle: "white" });
    const current = triggers({ country: "France", region: "Burgundy", wineStyle: "red" });
    const currentGrape = emptyGrape({ otherGrapeSelected: true, grapeBlend: "Mondeuse Blanche" });
    expect(evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "manual")).toBeNull();
  });

  it("a blend is never mutated merely because the style changed", () => {
    const prev = triggers({ country: "France", region: "Bordeaux", wineStyle: "red" });
    const current = triggers({ country: "France", region: "Bordeaux", wineStyle: "white" });
    const currentGrape = emptyGrape({ grapeBlendMode: "blend", selectedGrapes: ["Cabernet Sauvignon", "Merlot"] });
    // Style changed and the mapping *does* now differ (Sauv Blanc/Sémillon),
    // but since source is "manual" this must stay untouched — the Part 1
    // colour rule never fires for blend mode.
    expect(evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "manual")).toBeNull();
  });

  it("does not force a new mapping in the same event that just cleared a colour-incompatible value", () => {
    // Burgundy+Red also has its own valid mapping (Pinot Noir) — but the
    // style-change clear must win outright for this event, never
    // immediately replaced by a fresh auto-fill in the same call.
    const prev = triggers({ country: "France", region: "Burgundy", wineStyle: "white" });
    const current = triggers({ country: "France", region: "Burgundy", wineStyle: "red" });
    const currentGrape = emptyGrape({ grapeBlendMode: "single", grapeBlend: "Chardonnay" });
    const outcome = evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "auto");
    expect(outcome?.fields.grapeBlend).toBe("");
    expect(outcome?.message).toBe(GRAPE_STYLE_CLEARED_MESSAGE);
  });

  it("draft-restored / edited-record values start as manual by construction (source is caller-supplied, not derived here)", () => {
    // This function never inspects "is this the first render" — the caller
    // (lib/useGrapeAssistance.ts) is responsible for seeding `source` from
    // isGrapeValueEmpty() once, at mount. Passing "manual" for an existing,
    // non-empty value must never be overwritten, exactly like any other
    // manual value.
    const prev = triggers({ country: "Spain", region: "La Rioja" });
    const current = triggers({ country: "Spain", region: "La Rioja", wineStyle: "red" });
    const currentGrape = emptyGrape({ grapeBlendMode: "single", grapeBlend: "Tempranillo" });
    const source: GrapeValueSource = "manual";
    expect(evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, source)).toBeNull();
  });
});

describe("styleFilterKeyForHint — blind-guess privacy-safe hint adapter", () => {
  it("maps white_skin_only to the same 'white' style key non-blind forms use", () => {
    expect(styleFilterKeyForHint("white_skin_only")).toBe("white");
  });

  it("maps red_skin_only to 'red'", () => {
    expect(styleFilterKeyForHint("red_skin_only")).toBe("red");
  });

  it("maps all_skins (Bubbles/Sweet/Rosé/Other/unknown actual style) to '' — the same 'no style' key", () => {
    expect(styleFilterKeyForHint("all_skins")).toBe("");
  });

  it("degrades safely to '' when no hint is supplied at all", () => {
    expect(styleFilterKeyForHint(undefined)).toBe("");
  });
});

describe("Blind-guess grape assistance driven by the privacy-safe hint (reuses the same engine, no second mapping)", () => {
  it("Bordeaux guess + a Red-hinted bottle auto-switches to the red Bordeaux blend", () => {
    const match = getGrapeAssistance({
      country: "France",
      region: "Bordeaux",
      wineStyle: styleFilterKeyForHint("red_skin_only"),
    });
    expect(match).toEqual({ kind: "blend", grapes: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"] });
  });

  it("Bordeaux guess + a White-hinted bottle auto-switches to the white Bordeaux blend instead", () => {
    const match = getGrapeAssistance({
      country: "France",
      region: "Bordeaux",
      wineStyle: styleFilterKeyForHint("white_skin_only"),
    });
    expect(match).toEqual({ kind: "blend", grapes: ["Sauvignon Blanc", "Sémillon"] });
  });

  it("Burgundy guess + a White-hinted bottle auto-selects Chardonnay", () => {
    const match = getGrapeAssistance({
      country: "France",
      region: "Burgundy",
      wineStyle: styleFilterKeyForHint("white_skin_only"),
    });
    expect(match).toEqual({ kind: "single", grapes: ["Chardonnay"] });
  });

  it("Burgundy guess + a Red-hinted bottle auto-selects Pinot Noir", () => {
    const match = getGrapeAssistance({
      country: "France",
      region: "Burgundy",
      wineStyle: styleFilterKeyForHint("red_skin_only"),
    });
    expect(match).toEqual({ kind: "single", grapes: ["Pinot Noir"] });
  });

  it("Burgundy guess + an all_skins-hinted bottle (Bubbles/Sweet/Other actual style) applies no region+style mapping", () => {
    const match = getGrapeAssistance({
      country: "France",
      region: "Burgundy",
      wineStyle: styleFilterKeyForHint("all_skins"),
    });
    expect(match).toBeNull();
  });

  it("a manual guess grape is not overwritten by a later location change, for a fixed bottle hint", () => {
    // styleHint (and therefore this derived wineStyle key) never changes
    // during a guess form's lifetime — only the guessed country/region/
    // appellation do, since there is no participant style control at all.
    const fixedHint = styleFilterKeyForHint("white_skin_only");
    const prev = triggers({ country: "France", region: "Bordeaux", wineStyle: fixedHint });
    const current = triggers({ country: "France", region: "Burgundy", wineStyle: fixedHint });
    const currentGrape = emptyGrape({ grapeBlendMode: "single", grapeBlend: "Sangiovese" });
    expect(evaluateGrapeAssistanceChange(prev, { ...current, ...currentGrape }, "manual")).toBeNull();
  });

  it("the two messages reachable in a blind-guess form never mention style, colour, or the bottle's actual data", () => {
    // GRAPE_STYLE_CLEARED_MESSAGE is deliberately excluded here — it only
    // ever fires on a wine-style *change* (see evaluateGrapeAssistanceChange),
    // which can never happen in a blind-guess form since styleHint is a
    // fixed, per-bottle constant for the lifetime of that form (there is no
    // participant wine-style control to change at all).
    for (const message of [GRAPE_ASSISTANCE_APPLIED_MESSAGE, GRAPE_DETAILS_CLEARED_MESSAGE]) {
      expect(message.toLowerCase()).not.toMatch(/style|colour|color|white|red grape|based on/);
    }
  });
});
