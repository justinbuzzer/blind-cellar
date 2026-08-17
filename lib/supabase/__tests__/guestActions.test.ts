import { describe, expect, it } from "vitest";
import { bottleFormInputFromDto } from "@/lib/supabase/guestActions";
import { MyBottleDTO } from "@/lib/supabase/types";

function makeBottleDto(overrides: Partial<MyBottleDTO> = {}): MyBottleDTO {
  return {
    id: "wine-1",
    bottleNumber: 1,
    country: "France",
    region: "Burgundy",
    appellation: null,
    grapeBlendMode: "single",
    grapeBlend: "Pinot Noir",
    selectedGrapes: [],
    otherGrapesText: "",
    producer: "Domaine Example",
    wineCuvee: "Cuvee",
    vintage: "2019",
    wineStyle: "red",
    notes: null,
    photoPath: null,
    ...overrides,
  };
}

describe("bottleFormInputFromDto — Other grape", () => {
  it("sets otherGrapeSelected and preserves the custom text for an unrecognised single-variety grape", () => {
    const input = bottleFormInputFromDto(makeBottleDto({ grapeBlend: "Mondeuse Blanche" }));
    expect(input.otherGrapeSelected).toBe(true);
    expect(input.grapeBlend).toBe("Mondeuse Blanche");
  });

  it("leaves otherGrapeSelected false for a curated single-variety grape", () => {
    const input = bottleFormInputFromDto(makeBottleDto({ grapeBlend: "Pinot Noir" }));
    expect(input.otherGrapeSelected).toBe(false);
  });

  it("leaves otherGrapeSelected false in blend mode regardless of content", () => {
    const input = bottleFormInputFromDto(
      makeBottleDto({ grapeBlendMode: "blend", grapeBlend: "Cabernet Sauvignon / Merlot" })
    );
    expect(input.otherGrapeSelected).toBe(false);
  });

  it("leaves otherGrapeSelected false for a blank grape (no selection made yet)", () => {
    const input = bottleFormInputFromDto(makeBottleDto({ grapeBlend: "" }));
    expect(input.otherGrapeSelected).toBe(false);
  });
});
