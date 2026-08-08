import { describe, expect, it } from "vitest";
import {
  calculateBlindScoreV3,
  scoreBonusTextField,
  scoreCoreTextField,
  scoreGrapeBlend,
  scoreWineGuess,
  scoreWineGuessCoreV3,
} from "@/lib/scoring";
import { combineBlendComponents } from "@/lib/wineReferenceData";
import {
  CORE_MAX_POINTS,
  CURRENT_SCORING_VERSION,
  SCORING_VERSIONS,
  TOTAL_MAX_POINTS_PER_WINE,
  WineAnswerKey,
  WineGuess,
} from "@/types/tasting";

describe("scoring version constants", () => {
  it("assigns new sessions core_v3_appellation_conditional, never a client-influenced value", () => {
    expect(CURRENT_SCORING_VERSION).toBe("core_v3_appellation_conditional");
  });

  it("supports exactly the two scoring versions that have ever actually been deployed", () => {
    expect(SCORING_VERSIONS).toEqual(["legacy_v1", "core_v3_appellation_conditional"]);
  });
});

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

  it("awards full points for a matching custom (Other grape) single-variety value on both sides — no scoring changes needed for custom grapes", () => {
    const result = scoreGrapeBlend("single", "Mondeuse Blanche", "single", "Mondeuse Blanche");
    expect(result.correct).toBe(true);
    expect(result.points).toBe(30);
  });

  it("is case/whitespace-insensitive for a matching custom grape, same as any other text field", () => {
    expect(scoreGrapeBlend("single", "  mondeuse blanche  ", "single", "Mondeuse Blanche").correct).toBe(true);
  });

  it("awards zero points for two different custom grapes — never treats unknown grapes as automatically correct", () => {
    const result = scoreGrapeBlend("single", "Mondeuse Blanche", "single", "Trousseau");
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });

  it("does not crash or special-case a custom guess against a curated actual grape (and vice versa)", () => {
    expect(scoreGrapeBlend("single", "Mondeuse Blanche", "single", "Chardonnay").correct).toBe(false);
    expect(scoreGrapeBlend("single", "Chardonnay", "single", "Mondeuse Blanche").correct).toBe(false);
  });
});

describe("scoreGrapeBlend via the structured picker's derived text (combineBlendComponents)", () => {
  // The structured multi-select never calls scoreGrapeBlend directly — it
  // only ever produces the flattened, alphabetised "/"-joined text that
  // blendTokensFromText re-tokenises, same as any other blend text. These
  // confirm that pipeline actually holds end-to-end for the new picker's
  // output, so no scoring changes were needed for this feature.
  function flatten(selectedGrapes: string[], otherGrapesText: string): string {
    return combineBlendComponents(selectedGrapes, otherGrapesText).join(" / ");
  }

  it("scores full points when the same grapes are picked in a different order", () => {
    const answerText = flatten(["Cabernet Sauvignon", "Merlot"], "");
    const guessText = flatten(["Merlot", "Cabernet Sauvignon"], "");
    const result = scoreGrapeBlend("blend", guessText, "blend", answerText);
    expect(result.correct).toBe(true);
    expect(result.points).toBe(30);
  });

  it("scores full points for an alias match (Syrah selected vs. Shiraz typed as other-grapes)", () => {
    const answerText = flatten(["Grenache", "Syrah"], "");
    const guessText = flatten(["Grenache"], "Shiraz");
    const result = scoreGrapeBlend("blend", guessText, "blend", answerText);
    expect(result.correct).toBe(true);
    expect(result.points).toBe(30);
  });

  it("scores zero for a partial overlap — missing one of three answer components", () => {
    const answerText = flatten(["Grenache", "Syrah", "Mourvèdre"], "");
    const guessText = flatten(["Grenache", "Syrah"], "");
    const result = scoreGrapeBlend("blend", guessText, "blend", answerText);
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });

  it("scores zero when a curated pick and an unlisted grape combine to a set the answer doesn't fully match", () => {
    const answerText = flatten(["Grenache", "Syrah"], "");
    const guessText = flatten(["Grenache"], "Counoise");
    const result = scoreGrapeBlend("blend", guessText, "blend", answerText);
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
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
  wineStyle: "red",
  tastingOrder: 1,
};

function makeGuess(overrides: Partial<WineGuess> = {}): WineGuess {
  return {
    wineId: "wine-1",
    country: "Italy",
    region: "Piedmont",
    appellation: "",
    grapeBlendMode: "single",
    grapeBlend: "Nebbiolo",
    selectedGrapes: [],
    otherGrapesText: "",
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
    const scored = scoreWineGuess("guest-1", "Alice", makeGuess(), answer, "legacy_v1");
    expect(scored.corePoints).toBe(100);
    expect(scored.bonusPoints).toBe(20);
    expect(scored.totalPoints).toBe(120);
    expect(scored.totalPoints).toBe(TOTAL_MAX_POINTS_PER_WINE);
    expect(scored.corePoints).toBe(CORE_MAX_POINTS);
    expect(scored.coreAccuracyPercent).toBe(100);
    expect(scored.overallAccuracyPercent).toBe(100);
  });

  it("appellation guess is never part of fieldScores and never affects the score, whether it matches, mismatches, or is blank", () => {
    const perfectGuess = makeGuess();
    const answerWithAppellation: WineAnswerKey = { ...answer, appellation: "Barolo" };

    const withoutGuess = scoreWineGuess("guest-1", "Alice", perfectGuess, answerWithAppellation, "legacy_v1");
    const withMatchingGuess = scoreWineGuess(
      "guest-1",
      "Alice",
      { ...perfectGuess, appellation: "Barolo" },
      answerWithAppellation,
      "legacy_v1"
    );
    const withMismatchedGuess = scoreWineGuess(
      "guest-1",
      "Alice",
      { ...perfectGuess, appellation: "Barbaresco" },
      answerWithAppellation,
      "legacy_v1"
    );

    for (const scored of [withoutGuess, withMatchingGuess, withMismatchedGuess]) {
      expect(scored.totalPoints).toBe(120);
      expect(scored.corePoints).toBe(100);
      expect(scored.bonusPoints).toBe(20);
      expect(scored.fieldScores.some((f) => (f.field as string) === "appellation")).toBe(false);
    }
    expect(withMatchingGuess.appellationGuess).toBe("Barolo");
    expect(withMismatchedGuess.appellationGuess).toBe("Barbaresco");
    expect(withoutGuess.appellationGuess).toBeUndefined();
  });

  it("caps the core score at 100 and the max per-bottle score at 120", () => {
    const scored = scoreWineGuess("guest-1", "Alice", makeGuess(), answer, "legacy_v1");
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
    const scored = scoreWineGuess("guest-1", "Alice", guess, answer, "legacy_v1");
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
    const scored = scoreWineGuess("guest-1", "Alice", guess, answer, "legacy_v1");
    expect(scored.corePoints).toBe(50);
    expect(scored.bonusPoints).toBe(0);
    expect(scored.totalPoints).toBe(50);
  });

  it("never lets an unrelated extra property on the guess or answer influence the score (price band cannot influence scoring)", () => {
    const guessWithExtra = { ...makeGuess(), priceBand: "400-plus" } as unknown as WineGuess;
    const answerWithExtra = { ...answer, priceBand: "under-100" } as unknown as WineAnswerKey;
    const plainScore = scoreWineGuess("guest-1", "Alice", makeGuess(), answer, "legacy_v1");
    const scoreWithExtra = scoreWineGuess("guest-1", "Alice", guessWithExtra, answerWithExtra, "legacy_v1");
    expect(scoreWithExtra.totalPoints).toBe(plainScore.totalPoints);
    expect(scoreWithExtra.fieldScores.map((f) => f.field)).not.toContain("priceBand");
  });
});

describe("calculateBlindScoreV3 / scoreWineGuessCoreV3 (core_v3_appellation_conditional)", () => {
  it("awards 20 points for a correct Country", () => {
    const blind = calculateBlindScoreV3(makeGuess({ country: "Italy" }), answer);
    expect(blind.countryCorrect).toBe(true);
    expect(blind.countryPoints).toBe(20);
  });

  it("awards 20 points for a correct Region", () => {
    const blind = calculateBlindScoreV3(makeGuess({ region: "Piedmont" }), answer);
    expect(blind.regionCorrect).toBe(true);
    expect(blind.regionPoints).toBe(20);
  });

  it("awards 20 points for a correct Appellation when the actual wine has one", () => {
    const answerWithAppellation: WineAnswerKey = { ...answer, appellation: "Barolo" };
    const blind = calculateBlindScoreV3(makeGuess({ appellation: "Barolo" }), answerWithAppellation);
    expect(blind.appellationApplicable).toBe(true);
    expect(blind.appellationCorrect).toBe(true);
    expect(blind.appellationPoints).toBe(20);
  });

  it("awards 20 points for a correct Grape/blend", () => {
    const blind = calculateBlindScoreV3(makeGuess({ grapeBlend: "Nebbiolo" }), answer);
    expect(blind.grapeBlendCorrect).toBe(true);
    expect(blind.grapeBlendPoints).toBe(20);
  });

  it("awards 20 points for a correct Vintage", () => {
    const blind = calculateBlindScoreV3(makeGuess({ vintage: "2016" }), answer);
    expect(blind.vintageCorrect).toBe(true);
    expect(blind.vintagePoints).toBe(20);
  });

  it("totals 100/100 for a fully correct guess when the actual wine has an Appellation", () => {
    const answerWithAppellation: WineAnswerKey = { ...answer, appellation: "Barolo" };
    const blind = calculateBlindScoreV3(makeGuess({ appellation: "Barolo" }), answerWithAppellation);
    expect(blind.corePoints).toBe(100);
    expect(blind.corePossiblePoints).toBe(100);
    expect(blind.totalPoints).toBe(100);
    expect(blind.totalPossiblePoints).toBe(100);
  });

  it("totals 80/80 for a fully correct guess when the actual wine has no Appellation", () => {
    const blind = calculateBlindScoreV3(makeGuess(), answer);
    expect(blind.appellationApplicable).toBe(false);
    expect(blind.corePoints).toBe(80);
    expect(blind.corePossiblePoints).toBe(80);
    expect(blind.totalPoints).toBe(80);
    expect(blind.totalPossiblePoints).toBe(80);
  });

  it("marks Appellation not applicable with 0 possible points when the actual wine has none, regardless of the guess", () => {
    const blind = calculateBlindScoreV3(makeGuess({ appellation: "Barolo" }), answer);
    expect(blind.appellationApplicable).toBe(false);
    expect(blind.appellationCorrect).toBeNull();
    expect(blind.appellationPoints).toBe(0);
    expect(blind.appellationPossiblePoints).toBe(0);
  });

  it("never lets a guessed Appellation affect the score when the actual wine has none", () => {
    const withGuess = calculateBlindScoreV3(makeGuess({ appellation: "Barolo" }), answer);
    const withoutGuess = calculateBlindScoreV3(makeGuess({ appellation: "" }), answer);
    expect(withGuess.totalPoints).toBe(withoutGuess.totalPoints);
    expect(withGuess.corePossiblePoints).toBe(withoutGuess.corePossiblePoints);
  });

  it("awards Appellation points even when Country and Region are both wrong", () => {
    const answerWithAppellation: WineAnswerKey = { ...answer, appellation: "Barolo" };
    const blind = calculateBlindScoreV3(
      makeGuess({ country: "France", region: "Burgundy", appellation: "Barolo" }),
      answerWithAppellation
    );
    expect(blind.countryCorrect).toBe(false);
    expect(blind.regionCorrect).toBe(false);
    expect(blind.appellationCorrect).toBe(true);
    expect(blind.appellationPoints).toBe(20);
  });

  it("never awards partial credit for a mismatched Appellation", () => {
    const answerWithAppellation: WineAnswerKey = { ...answer, appellation: "Barolo" };
    const blind = calculateBlindScoreV3(makeGuess({ appellation: "Barbaresco" }), answerWithAppellation);
    expect(blind.appellationCorrect).toBe(false);
    expect(blind.appellationPoints).toBe(0);
  });

  it("uses the same safe normalisation (trim/case-insensitive) for Appellation as every other field", () => {
    const answerWithAppellation: WineAnswerKey = { ...answer, appellation: "Barolo" };
    const blind = calculateBlindScoreV3(makeGuess({ appellation: "  barolo  " }), answerWithAppellation);
    expect(blind.appellationCorrect).toBe(true);
  });

  it("Producer and Wine/cuvée never affect the core_v3 score", () => {
    const withPrecision = calculateBlindScoreV3(
      makeGuess({ producer: "Someone Else", wineName: "Different Wine" }),
      answer
    );
    const withoutPrecision = calculateBlindScoreV3(
      makeGuess({ producer: "", wineName: "" }),
      answer
    );
    expect(withPrecision.totalPoints).toBe(withoutPrecision.totalPoints);
    expect(withPrecision.totalPossiblePoints).toBe(withoutPrecision.totalPossiblePoints);
  });

  it("scoreWineGuessCoreV3 never produces a bonus-category FieldScore, and carries producer/wine-cuvée as unscored passthroughs", () => {
    const scored = scoreWineGuessCoreV3("guest-1", "Alice", makeGuess({ producer: "Someone Else" }), answer);
    expect(scored.fieldScores.every((f) => f.category === "core")).toBe(true);
    expect(scored.bonusPoints).toBe(0);
    expect(scored.bonusPossiblePoints).toBe(0);
    expect(scored.producerGuess).toBe("Someone Else");
    expect(scored.scoringVersion).toBe("core_v3_appellation_conditional");
  });

  it("scoreWineGuessCoreV3's possible score never exceeds 100", () => {
    const answerWithAppellation: WineAnswerKey = { ...answer, appellation: "Barolo" };
    const scored = scoreWineGuessCoreV3("guest-1", "Alice", makeGuess({ appellation: "Barolo" }), answerWithAppellation);
    expect(scored.totalPossiblePoints).toBeLessThanOrEqual(100);
    expect(scored.totalPossiblePoints).toBe(100);
  });

  it("dispatches to core_v3 via the shared scoreWineGuess entry point when given that version", () => {
    const answerWithAppellation: WineAnswerKey = { ...answer, appellation: "Barolo" };
    const scored = scoreWineGuess(
      "guest-1",
      "Alice",
      makeGuess({ appellation: "Barolo" }),
      answerWithAppellation,
      "core_v3_appellation_conditional"
    );
    expect(scored.scoringVersion).toBe("core_v3_appellation_conditional");
    expect(scored.totalPoints).toBe(100);
    expect(scored.fieldScores.find((f) => f.field === "appellation")?.applicable).toBe(true);
  });
});
