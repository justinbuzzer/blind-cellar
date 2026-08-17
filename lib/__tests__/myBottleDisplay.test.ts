import { describe, expect, it } from "vitest";
import { formatOwnContributedBottle } from "@/lib/myBottleDisplay";
import { MyBottleDTO } from "@/lib/supabase/types";

function makeBottle(overrides: Partial<MyBottleDTO> = {}): MyBottleDTO {
  return {
    id: "wine-1",
    bottleNumber: 3,
    country: "France",
    region: "Burgundy",
    appellation: "Volnay",
    grapeBlendMode: "single",
    grapeBlend: "Pinot Noir",
    selectedGrapes: [],
    otherGrapesText: "",
    producer: "Domaine Example",
    wineCuvee: "Village",
    vintage: "2022",
    wineStyle: "red",
    notes: null,
    photoPath: null,
    ...overrides,
  };
}

describe("formatOwnContributedBottle — primary label", () => {
  it("formats Producer — Wine/cuvée when both exist", () => {
    const result = formatOwnContributedBottle(makeBottle());
    expect(result.primaryLabel).toBe("Domaine Example — Village");
  });

  it("falls back to Producer only when wine/cuvée is missing", () => {
    const result = formatOwnContributedBottle(makeBottle({ wineCuvee: "" }));
    expect(result.primaryLabel).toBe("Domaine Example");
  });

  it("falls back to wine/cuvée only when producer is missing", () => {
    const result = formatOwnContributedBottle(makeBottle({ producer: "" }));
    expect(result.primaryLabel).toBe("Village");
  });

  it("falls back to vintage + grape when both producer and wine/cuvée are missing", () => {
    const result = formatOwnContributedBottle(makeBottle({ producer: "", wineCuvee: "" }));
    expect(result.primaryLabel).toBe("2022 Pinot Noir");
  });

  it("falls back to grape alone when producer, wine/cuvée, and vintage are all missing", () => {
    const result = formatOwnContributedBottle(
      makeBottle({ producer: "", wineCuvee: "", vintage: "" })
    );
    expect(result.primaryLabel).toBe("Pinot Noir");
  });

  it("falls back to 'Unnamed wine' when no usable metadata exists", () => {
    const result = formatOwnContributedBottle(
      makeBottle({ producer: "", wineCuvee: "", vintage: "", grapeBlend: "" })
    );
    expect(result.primaryLabel).toBe("Unnamed wine");
  });

  it("never invents a name — whitespace-only fields are treated as missing", () => {
    const result = formatOwnContributedBottle(makeBottle({ producer: "   ", wineCuvee: "  " }));
    expect(result.primaryLabel).toBe("2022 Pinot Noir");
  });

  it("preserves accents and Unicode characters", () => {
    const result = formatOwnContributedBottle(
      makeBottle({ producer: "Château Example", wineCuvee: "Réserve" })
    );
    expect(result.primaryLabel).toBe("Château Example — Réserve");
  });
});

describe("formatOwnContributedBottle — origin line", () => {
  it("orders as vintage · appellation, region, country", () => {
    const result = formatOwnContributedBottle(makeBottle());
    expect(result.originLine).toBe("2022 · Volnay, Burgundy, France");
  });

  it("shows NV correctly for non-vintage wines", () => {
    const result = formatOwnContributedBottle(makeBottle({ vintage: "NV" }));
    expect(result.originLine).toBe("NV · Volnay, Burgundy, France");
  });

  it("omits a missing appellation cleanly without duplicate punctuation", () => {
    const result = formatOwnContributedBottle(makeBottle({ appellation: null }));
    expect(result.originLine).toBe("2022 · Burgundy, France");
  });

  it("puts appellation before region", () => {
    const result = formatOwnContributedBottle(
      makeBottle({ appellation: "Chablis", region: "Burgundy" })
    );
    expect(result.originLine?.indexOf("Chablis")).toBeLessThan(
      result.originLine?.indexOf("Burgundy") ?? -1
    );
  });
});

describe("formatOwnContributedBottle — grape line", () => {
  it("shows the saved grape/blend text", () => {
    const result = formatOwnContributedBottle(makeBottle({ grapeBlend: "Cabernet Sauvignon" }));
    expect(result.grapeLine).toBe("Cabernet Sauvignon");
  });

  it("is null when no grape/blend is saved", () => {
    const result = formatOwnContributedBottle(makeBottle({ grapeBlend: "" }));
    expect(result.grapeLine).toBeNull();
  });
});

describe("formatOwnContributedBottle — bottle number and status", () => {
  it("keeps the bottle number as secondary text, never the primary label", () => {
    const result = formatOwnContributedBottle(makeBottle({ bottleNumber: 3 }));
    expect(result.bottleNumberLabel).toBe("Registered as Bottle 3");
    expect(result.primaryLabel).not.toContain("Bottle 3");
  });

  it("preserves the existing 'Details saved' status text", () => {
    const result = formatOwnContributedBottle(makeBottle());
    expect(result.statusLabel).toBe("Details saved");
  });
});
