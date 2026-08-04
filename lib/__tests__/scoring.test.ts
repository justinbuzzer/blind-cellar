import { describe, expect, it } from "vitest";
import {
  scoreBonusTextField,
  scoreCoreTextField,
  scoreGrapeBlend,
  scoreWineGuess,
} from "@/lib/scoring";
import { CORE_MAX_POINTS, TOTAL_MAX_POINTS_PER_WINE, WineAnswerKey, WineGuess } from "@/types/tasting";

describe("scoreCoreTextField", () => {
  it("awards 20 points for an exact normalised country match", () => {
    const result = scoreCoreTextField("country", "france", "France");
    expect(result.correct).toBe(true);
    expect(result.points).toBe(20);
  });

  it("awards 30 points for an exact normalised region match", () => {
    const result = scoreCoreTextField("region", "bordeaux", "Bordeaux");
    expect(result.correct).toBe(true);
    expect(result.points).toBe(30);
  });

  it("awards 20 points for an exact vintage year match", () => {
    const result = scoreCoreTextField("vintage", "2019", "2019");
    expect(result.correct).toBe(true);
    expect(result.points).toBe(20);
  });

  it("matches NV against NV and awards 20 points", () => {
    const result = scoreCoreTextField("vintage", "nv", "NV");
    expect(result.correct).toBe(true);
    expect(result.points).toBe(20);
  });

  it("does not match NV against a specific year", () => {
    const result = scoreCoreTextField("vintage", "NV", "2019");
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });

  it("awards zero points for a non-match", () => {
    const result = scoreCoreTextField("country", "Spain", "France");
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe("scoreBonusTextField", () => {
  it("awards 10 bonus points for an exact normalised producer match", () => {
    const result = scoreBonusTextField("producer", "bollinger", "Bollinger");
    expect(result.category).toBe("bonus");
    expect(result.correct).toBe(true);
    expect(result.points).toBe(10);
  });

  it("awards 10 bonus points for an exact normalised wine/cuvée match", () => {
    const result = scoreBonusTextField("wineName", "special cuvee", "Special Cuvee");
    expect(result.category).toBe("bonus");
    expect(result.correct).toBe(true);
    expect(result.points).toBe(10);
  });

  it("does not award partial credit for a close-but-wrong guess", () => {
    const result = scoreBonusTextField("producer", "Bollinger", "Krug");
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe("scoreGrapeBlend", () => {
  it("awards 30 points for an exact single-variety match", () => {
    const result = scoreGrapeBlend("single", "Nebbiolo", "single", "Nebbiolo");
    expect(result.category).toBe("core");
    expect(result.correct).toBe(true);
    expect(result.points).toBe(30);
  });

  it("awards 30 points for a blend with the same grapes in a different order", () => {
    const result = scoreGrapeBlend(
      "blend",
      "Merlot / Cabernet Sauvignon",
      "blend",
      "Cabernet Sauvignon / Merlot"
    );
    expect(result.correct).toBe(true);
    expect(result.points).toBe(30);
  });

  it("awards zero points for a partial blend overlap (no partial credit)", () => {
    const result = scoreGrapeBlend(
      "blend",
      "Cabernet Sauvignon / Merlot",
      "blend",
      "Cabernet Sauvignon / Merlot / Cabernet Franc"
    );
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });

  it("awards zero points when the guess and answer modes don't match, even if the text overlaps", () => {
    const result = scoreGrapeBlend("single", "Grenache", "blend", "Grenache / Syrah / Mourvèdre");
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });

  it("treats Syrah and Shiraz as equivalent", () => {
    expect(scoreGrapeBlend("single", "Shiraz", "single", "Syrah").correct).toBe(true);
  });

  it("treats Pinot Gris and Pinot Grigio as equivalent", () => {
    expect(scoreGrapeBlend("single", "Pinot Grigio", "single", "Pinot Gris").correct).toBe(true);
  });

  it("treats Zinfandel and Primitivo as equivalent", () => {
    expect(scoreGrapeBlend("single", "Primitivo", "single", "Zinfandel").correct).toBe(true);
  });

  it("does not treat unrelated grapes as equivalent", () => {
    expect(scoreGrapeBlend("single", "Merlot", "single", "Malbec").correct).toBe(false);
  });

  it("awards zero points for a blank guess", () => {
    expect(scoreGrapeBlend("single", "", "single", "Nebbiolo").correct).toBe(false);
  });

  it("falls back to alias-aware text comparison when both modes are unknown (legacy data)", () => {
    // Two legacy rows predating grape_blend_mode, both storing plain text.
    const result = scoreGrapeBlend("", "Nebbiolo", "", "nebbiolo");
    expect(result.correct).toBe(true);
    expect(result.points).toBe(30);
  });

  it("falls back safely when only the answer's mode is unknown (legacy bottle, new-form guess)", () => {
    const result = scoreGrapeBlend("single", "Syrah", "", "Shiraz");
    expect(result.correct).toBe(true);
  });

  it("does not force a legacy blend-style free-text answer to match an unrelated single guess", () => {
    const result = scoreGrapeBlend("single", "Grenache", "", "Grenache blend");
    expect(result.correct).toBe(false);
  });
});

const answer: WineAnswerKey = {
  id: "wine-1",
  code: "Wine A",
  country: "Italy",
  region: "Piedmont",
  grapeBlendMode: "single",
  grapeBlend: "Nebbiolo",
  producer: "Giacomo Conterno",
  wineName: "Cascina Francia",
  vintage: "2016",
};

function makeGuess(overrides: Partial<WineGuess> = {}): WineGuess {
  return {
    wineId: "wine-1",
    country: "Italy",
    region: "Piedmont",
    grapeBlendMode: "single",
    grapeBlend: "Nebbiolo",
    producer: "Giacomo Conterno",
    wineName: "Cascina Francia",
    vintage: "2016",
    rating: 90,
    confidence: "high",
    ...overrides,
  };
}

describe("scoreWineGuess", () => {
  it("awards the full 120 points for a perfect guess (100 core + 20 bonus)", () => {
    const scored = scoreWineGuess("guest-1", "Alice", makeGuess(), answer);
    expect(scored.corePoints).toBe(100);
    expect(scored.bonusPoints).toBe(20);
    expect(scored.totalPoints).toBe(120);
    expect(scored.totalPoints).toBe(TOTAL_MAX_POINTS_PER_WINE);
    expect(scored.corePoints).toBe(CORE_MAX_POINTS);
    expect(scored.coreAccuracyPercent).toBe(100);
    expect(scored.overallAccuracyPercent).toBe(100);
  });

  it("caps the core score at 100 and the max per-bottle score at 120", () => {
    const scored = scoreWineGuess("guest-1", "Alice", makeGuess(), answer);
    expect(scored.corePoints).toBeLessThanOrEqual(100);
    expect(scored.totalPoints).toBeLessThanOrEqual(120);
  });

  it("awards zero points when every field is wrong", () => {
    const guess = makeGuess({
      country: "France",
      region: "Champagne",
      grapeBlendMode: "single",
      grapeBlend: "Pinot Noir",
      producer: "Bollinger",
      wineName: "Special Cuvee",
      vintage: "2018",
    });
    const scored = scoreWineGuess("guest-1", "Alice", guess, answer);
    expect(scored.corePoints).toBe(0);
    expect(scored.bonusPoints).toBe(0);
    expect(scored.totalPoints).toBe(0);
  });

  it("sums only the correct core fields for a partial core-only guess", () => {
    // Correct: country (20) + region (30) = 50 core; bonus fields wrong -> 0.
    const guess = makeGuess({
      grapeBlendMode: "single",
      grapeBlend: "Sangiovese",
      producer: "Someone Else",
      wineName: "Different Wine",
      vintage: "1999",
    });
    const scored = scoreWineGuess("guest-1", "Alice", guess, answer);
    expect(scored.corePoints).toBe(50);
    expect(scored.bonusPoints).toBe(0);
    expect(scored.totalPoints).toBe(50);
  });

  it("never lets an unrelated extra property on the guess or answer influence the score (price band cannot influence scoring)", () => {
    const guessWithExtra = { ...makeGuess(), priceBand: "400-plus" } as unknown as WineGuess;
    const answerWithExtra = { ...answer, priceBand: "under-100" } as unknown as WineAnswerKey;
    const plainScore = scoreWineGuess("guest-1", "Alice", makeGuess(), answer);
    const scoreWithExtra = scoreWineGuess("guest-1", "Alice", guessWithExtra, answerWithExtra);
    expect(scoreWithExtra.totalPoints).toBe(plainScore.totalPoints);
    expect(scoreWithExtra.fieldScores.map((f) => f.field)).not.toContain("priceBand");
  });
});
