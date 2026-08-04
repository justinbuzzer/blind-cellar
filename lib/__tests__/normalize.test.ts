import { describe, expect, it } from "vitest";
import { isNormalizedMatch, normalizeText } from "@/lib/normalize";

describe("normalizeText", () => {
  it("lowercases and trims", () => {
    expect(normalizeText("  Château  ")).toBe(normalizeText("chateau"));
  });

  it("strips accents", () => {
    expect(normalizeText("Château")).toBe(normalizeText("Chateau"));
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeText("Domaine   de   la   Janasse")).toBe(
      normalizeText("Domaine de la Janasse")
    );
  });

  it("treats hyphens as spaces", () => {
    expect(normalizeText("Chateauneuf-du-Pape")).toBe(
      normalizeText("Chateauneuf du Pape")
    );
  });

  it("drops apostrophes and periods", () => {
    expect(normalizeText("St. Julien's")).toBe(normalizeText("St Juliens"));
  });
});

describe("isNormalizedMatch", () => {
  it("matches equivalent strings after normalisation", () => {
    expect(isNormalizedMatch("Chateauneuf-du-Pape", "Châteauneuf du Pape")).toBe(true);
  });

  it("does not match different words", () => {
    expect(isNormalizedMatch("Barolo", "Barbaresco")).toBe(false);
  });

  it("does not match when either side is empty", () => {
    expect(isNormalizedMatch("", "Barolo")).toBe(false);
    expect(isNormalizedMatch("Barolo", "")).toBe(false);
    expect(isNormalizedMatch("", "")).toBe(false);
  });
});
