import { describe, expect, it } from "vitest";
import {
  formatSeenGroupRating,
  formatSeenRatingStatus,
  formatSeenWineIdentity,
  formatSeenWineSecondaryLine,
} from "@/lib/seenHostControls";

describe("formatSeenWineIdentity", () => {
  it("formats as 'Producer — Wine/cuvée'", () => {
    expect(formatSeenWineIdentity({ producer: "Domaine Leflaive", wineCuvee: "Puligny-Montrachet" })).toBe(
      "Domaine Leflaive — Puligny-Montrachet"
    );
  });

  it("preserves accents and original display text", () => {
    expect(formatSeenWineIdentity({ producer: "Château Margaux", wineCuvee: "Margaux" })).toBe(
      "Château Margaux — Margaux"
    );
  });
});

describe("formatSeenWineSecondaryLine", () => {
  it("includes vintage, appellation, region, and country when all present", () => {
    const line = formatSeenWineSecondaryLine({
      vintage: "2021",
      appellation: "Chablis",
      region: "Burgundy",
      country: "France",
    });
    expect(line).toBe("2021 · Chablis, Burgundy · France");
  });

  it("supports NV in place of a vintage year", () => {
    const line = formatSeenWineSecondaryLine({
      vintage: "NV",
      appellation: null,
      region: "Champagne",
      country: "France",
    });
    expect(line).toBe("NV · Champagne · France");
  });

  it("omits appellation cleanly when absent", () => {
    const line = formatSeenWineSecondaryLine({
      vintage: "2018",
      appellation: null,
      region: "Piedmont",
      country: "Italy",
    });
    expect(line).toBe("2018 · Piedmont · Italy");
  });

  it("does not duplicate region when it matches appellation (case/whitespace-insensitive)", () => {
    const line = formatSeenWineSecondaryLine({
      vintage: "NV",
      appellation: "Champagne",
      region: "Champagne",
      country: "France",
    });
    expect(line).toBe("NV · Champagne · France");
  });

  it("omits country cleanly when absent", () => {
    const line = formatSeenWineSecondaryLine({
      vintage: "2020",
      appellation: "Barolo",
      region: "Piedmont",
      country: null,
    });
    expect(line).toBe("2020 · Barolo, Piedmont");
  });

  it("omits region and country cleanly when both absent", () => {
    const line = formatSeenWineSecondaryLine({ vintage: "2020", appellation: null, region: null, country: null });
    expect(line).toBe("2020");
  });
});

describe("formatSeenRatingStatus", () => {
  it("formats the exact required copy", () => {
    expect(formatSeenRatingStatus(5, 8)).toBe("5 of 8 rated");
    expect(formatSeenRatingStatus(0, 8)).toBe("0 of 8 rated");
    expect(formatSeenRatingStatus(8, 8)).toBe("8 of 8 rated");
  });
});

describe("formatSeenGroupRating", () => {
  it("formats a revealed average to one decimal place", () => {
    expect(formatSeenGroupRating(92.4)).toBe("Group rating: 92.4");
  });

  it("shows one decimal place even for a whole number", () => {
    expect(formatSeenGroupRating(90)).toBe("Group rating: 90.0");
  });

  it("shows the exact required copy when there are no valid ratings", () => {
    expect(formatSeenGroupRating(null)).toBe("No ratings submitted");
  });
});
