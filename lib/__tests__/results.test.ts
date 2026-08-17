import { describe, expect, it } from "vitest";
import {
  buildTastingReport,
  calculateBestTaster,
  calculateMostDivisiveWine,
  calculateTasterResults,
  calculateWineOfTheNight,
} from "@/lib/results";
import {
  GuestSubmission,
  TasterResult,
  TastingSession,
  WineAnswerKey,
  WineResult,
} from "@/types/tasting";

function makeWine(id: string, code: string): WineAnswerKey {
  return {
    id,
    code,
    country: "France",
    region: "Burgundy",
    grapeBlendMode: "single",
    grapeBlend: "Pinot Noir",
    producer: `Producer ${code}`,
    wineName: `Cuvee ${code}`,
    vintage: "2020",
    wineStyle: "red",
    tastingOrder: 1,
  };
}

function makeWineResult(overrides: Partial<WineResult>): WineResult {
  return {
    wine: makeWine("w1", "Wine A"),
    averageRating: null,
    numRatings: 0,
    lowestRating: null,
    highestRating: null,
    ratingSpread: null,
    guesses: [],
    topTasters: [],
    scoringVersion: "legacy_v1",
    ...overrides,
  };
}

function makeTasterResult(overrides: Partial<TasterResult>): TasterResult {
  return {
    guestId: "g1",
    guestName: "Guest",
    rank: 1,
    totalPoints: 0,
    totalPossible: 120,
    corePoints: 0,
    corePossible: 100,
    bonusPoints: 0,
    bonusPossible: 20,
    overallAccuracyPercent: 0,
    coreAccuracyPercent: 0,
    exactCoreMatches: 0,
    submittedGuessCount: 0,
    averageRatingGiven: null,
    ...overrides,
  };
}

describe("calculateWineOfTheNight", () => {
  it("picks the single highest average rating", () => {
    const wines = [
      makeWineResult({ wine: makeWine("a", "Wine A"), averageRating: 90 }),
      makeWineResult({ wine: makeWine("b", "Wine B"), averageRating: 85 }),
    ];
    const result = calculateWineOfTheNight(wines);
    expect(result).toHaveLength(1);
    expect(result[0].wine.code).toBe("Wine A");
  });

  it("breaks a tied average rating using the lower spread", () => {
    const wines = [
      makeWineResult({ wine: makeWine("a", "Wine A"), averageRating: 90, ratingSpread: 10 }),
      makeWineResult({ wine: makeWine("b", "Wine B"), averageRating: 90, ratingSpread: 4 }),
    ];
    const result = calculateWineOfTheNight(wines);
    expect(result).toHaveLength(1);
    expect(result[0].wine.code).toBe("Wine B");
  });

  it("reports a genuine tie when average and spread both match", () => {
    const wines = [
      makeWineResult({ wine: makeWine("a", "Wine A"), averageRating: 90, ratingSpread: 5 }),
      makeWineResult({ wine: makeWine("b", "Wine B"), averageRating: 90, ratingSpread: 5 }),
    ];
    const result = calculateWineOfTheNight(wines);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array when no wine has any ratings", () => {
    const wines = [makeWineResult({}), makeWineResult({})];
    expect(calculateWineOfTheNight(wines)).toEqual([]);
  });
});

describe("calculateBestTaster", () => {
  it("returns every taster tied for rank 1", () => {
    const tasters = [
      makeTasterResult({ guestId: "1", rank: 2 }),
      makeTasterResult({ guestId: "2", rank: 1 }),
      makeTasterResult({ guestId: "3", rank: 1 }),
    ];
    const best = calculateBestTaster(tasters);
    expect(best.map((t) => t.guestId).sort()).toEqual(["2", "3"]);
  });

  it("returns an empty array for an empty leaderboard", () => {
    expect(calculateBestTaster([])).toEqual([]);
  });
});

describe("calculateMostDivisiveWine", () => {
  it("picks the wine with the largest rating spread", () => {
    const wines = [
      makeWineResult({ wine: makeWine("a", "Wine A"), ratingSpread: 5 }),
      makeWineResult({ wine: makeWine("b", "Wine B"), ratingSpread: 20 }),
    ];
    const result = calculateMostDivisiveWine(wines);
    expect(result).toHaveLength(1);
    expect(result[0].wine.code).toBe("Wine B");
  });
});

describe("calculateTasterResults ranking", () => {
  const session: TastingSession = {
    id: "s1",
    code: "MAROON-1",
    title: "Test Tasting",
    date: "2026-01-01",
    status: "revealed",
    createdAt: "2026-01-01T00:00:00Z",
    wines: [makeWine("w1", "Wine A")],
    scoringVersion: "legacy_v1",
  };

  function submission(
    guestId: string,
    name: string,
    rating: number,
    overrides: Partial<{ country: string; region: string; grapeBlend: string; producer: string }> = {}
  ): GuestSubmission {
    return {
      id: guestId,
      guestId,
      guestName: name,
      sessionCode: session.code,
      locked: true,
      guesses: [
        {
          wineId: "w1",
          country: overrides.country ?? "France",
          region: overrides.region ?? "",
          appellation: "",
          grapeBlendMode: "single",
          grapeBlend: overrides.grapeBlend ?? "",
          selectedGrapes: [],
          otherGrapesText: "",
          producer: overrides.producer ?? "",
          wineName: "",
          vintage: "",
          rating,
          confidence: "medium",
        },
      ],
    };
  }

  it("gives two tasters the same rank when totally tied, and skips the next rank", () => {
    const submissions = [
      submission("1", "Alice", 90),
      submission("2", "Ben", 92),
      submission("3", "Chidi", 80, { country: "Spain" }),
    ];
    const results = calculateTasterResults(session, submissions);
    const alice = results.find((r) => r.guestId === "1")!;
    const ben = results.find((r) => r.guestId === "2")!;
    const chidi = results.find((r) => r.guestId === "3")!;

    expect(alice.rank).toBe(1);
    expect(ben.rank).toBe(1);
    expect(chidi.rank).toBe(3);
  });

  it("breaks a total-points tie using core points", () => {
    // Taster A: country (20) + region (30) core, no bonus -> core 50, total 50.
    // Taster B: grape/blend (30) core + both bonus fields (20) -> core 30, total 50.
    // Totals tie at 50; A must rank above B on the higher core score.
    const tied: GuestSubmission[] = [
      {
        id: "core-heavy",
        guestId: "core-heavy",
        guestName: "Core Heavy",
        sessionCode: session.code,
        locked: true,
        guesses: [
          {
            wineId: "w1",
            country: "France",
            region: "Burgundy",
            appellation: "",
            grapeBlendMode: "single",
            selectedGrapes: [],
            otherGrapesText: "",
            grapeBlend: "",
            producer: "",
            wineName: "",
            vintage: "",
            rating: 90,
            confidence: "medium",
          },
        ],
      },
      {
        id: "bonus-heavy",
        guestId: "bonus-heavy",
        guestName: "Bonus Heavy",
        sessionCode: session.code,
        locked: true,
        guesses: [
          {
            wineId: "w1",
            country: "",
            region: "",
            appellation: "",
            grapeBlendMode: "single",
            selectedGrapes: [],
            otherGrapesText: "",
            grapeBlend: "Pinot Noir",
            producer: "Producer Wine A",
            wineName: "Cuvee Wine A",
            vintage: "",
            rating: 90,
            confidence: "medium",
          },
        ],
      },
    ];
    const results = calculateTasterResults(session, tied);
    const coreHeavy = results.find((r) => r.guestId === "core-heavy")!;
    const bonusHeavy = results.find((r) => r.guestId === "bonus-heavy")!;

    expect(coreHeavy.totalPoints).toBe(50);
    expect(bonusHeavy.totalPoints).toBe(50);
    expect(coreHeavy.corePoints).toBe(50);
    expect(bonusHeavy.corePoints).toBe(30);
    expect(coreHeavy.rank).toBe(1);
    expect(bonusHeavy.rank).toBe(2);
  });

  it("breaks an exact total-and-core tie using exact core matches, and shares rank when fully tied", () => {
    const session2: TastingSession = {
      ...session,
      // makeWine hard-codes identical country/region/grapeBlend/vintage
      // answers for every wine, so both wines here share one answer key.
      wines: [makeWine("w1", "Wine A"), makeWine("w2", "Wine B")],
    };
    // Taster A: wine1 region+grapeBlend correct (30+30=60, 2 matches), wine2 nothing.
    //   -> core 60, matches 2, bonus 0, total 60.
    // Taster B: wine1 country correct (20, 1 match), wine2 country+vintage correct (20+20=40, 2 matches).
    //   -> core 60, matches 3, bonus 0, total 60.
    // Same total and core score; B has more exact core matches, so B ranks first.
    const submissions: GuestSubmission[] = [
      {
        id: "a",
        guestId: "a",
        guestName: "Alice",
        sessionCode: session2.code,
        locked: true,
        guesses: [
          {
            wineId: "w1",
            country: "",
            region: "Burgundy",
            appellation: "",
            grapeBlendMode: "single",
            selectedGrapes: [],
            otherGrapesText: "",
            grapeBlend: "Pinot Noir",
            producer: "",
            wineName: "",
            vintage: "",
            rating: 90,
            confidence: "medium",
          },
          {
            wineId: "w2",
            country: "",
            region: "",
            appellation: "",
            grapeBlendMode: "single",
            selectedGrapes: [],
            otherGrapesText: "",
            grapeBlend: "",
            producer: "",
            wineName: "",
            vintage: "",
            rating: 90,
            confidence: "medium",
          },
        ],
      },
      {
        id: "b",
        guestId: "b",
        guestName: "Ben",
        sessionCode: session2.code,
        locked: true,
        guesses: [
          {
            wineId: "w1",
            country: "France",
            region: "",
            appellation: "",
            grapeBlendMode: "single",
            selectedGrapes: [],
            otherGrapesText: "",
            grapeBlend: "",
            producer: "",
            wineName: "",
            vintage: "",
            rating: 90,
            confidence: "medium",
          },
          {
            wineId: "w2",
            country: "France",
            region: "",
            appellation: "",
            grapeBlendMode: "single",
            selectedGrapes: [],
            otherGrapesText: "",
            grapeBlend: "",
            producer: "",
            wineName: "",
            vintage: "2020",
            rating: 90,
            confidence: "medium",
          },
        ],
      },
    ];
    const results = calculateTasterResults(session2, submissions);
    const alice = results.find((r) => r.guestId === "a")!;
    const ben = results.find((r) => r.guestId === "b")!;

    expect(alice.totalPoints).toBe(60);
    expect(ben.totalPoints).toBe(60);
    expect(alice.corePoints).toBe(60);
    expect(ben.corePoints).toBe(60);
    expect(alice.exactCoreMatches).toBe(2);
    expect(ben.exactCoreMatches).toBe(3);
    expect(ben.rank).toBe(1);
    expect(alice.rank).toBe(2);
  });

  it("shares rank 1 when total, core, and exact core matches are all fully tied", () => {
    const guesses: GuestSubmission["guesses"] = [
      {
        wineId: "w1",
        country: "France",
        region: "",
        appellation: "",
        grapeBlendMode: "single",
        selectedGrapes: [],
        otherGrapesText: "",
        grapeBlend: "",
        producer: "",
        wineName: "",
        vintage: "",
        rating: 90,
        confidence: "medium",
      },
    ];
    const submissions: GuestSubmission[] = [
      { id: "a", guestId: "a", guestName: "Alice", sessionCode: session.code, locked: true, guesses },
      { id: "b", guestId: "b", guestName: "Ben", sessionCode: session.code, locked: true, guesses },
    ];
    const results = calculateTasterResults(session, submissions);
    expect(results[0].rank).toBe(1);
    expect(results[1].rank).toBe(1);
  });

  it("rounds accuracy to one decimal place", () => {
    const submissions = [submission("1", "Alice", 90)];
    const results = calculateTasterResults(session, submissions);
    expect(Number.isFinite(results[0].overallAccuracyPercent)).toBe(true);
    expect(results[0].overallAccuracyPercent).toBe(
      Math.round(results[0].overallAccuracyPercent * 10) / 10
    );
  });

  it("ignores unlocked (draft) submissions", () => {
    const draft = submission("1", "Alice", 90);
    draft.locked = false;
    const results = calculateTasterResults(session, [draft]);
    expect(results).toHaveLength(0);
  });

  it("represents the host as a single ordinary participant, never counted twice", () => {
    const hostGuestId = "host-guest-id";
    const submissions = [
      submission(hostGuestId, "Host Alice", 91),
      submission("2", "Ben", 85, { country: "Spain" }),
    ];
    const results = calculateTasterResults(session, submissions);

    const hostEntries = results.filter((r) => r.guestId === hostGuestId);
    expect(hostEntries).toHaveLength(1);
    expect(results).toHaveLength(2);
    expect(new Set(results.map((r) => r.guestId)).size).toBe(results.length);
  });
});

describe("calculateTasterResults ranking (core_v3_appellation_conditional)", () => {
  function v3Wine(id: string, code: string, appellation?: string): WineAnswerKey {
    return {
      id,
      code,
      country: "Italy",
      region: "Piedmont",
      appellation,
      grapeBlendMode: "single",
      grapeBlend: "Nebbiolo",
      producer: "Producer",
      wineName: "Cuvee",
      vintage: "2018",
      wineStyle: "red",
      tastingOrder: 1,
    };
  }

  function v3Guess(wineId: string, overrides: Partial<WineAnswerKey> = {}): GuestSubmission["guesses"][number] {
    return {
      wineId,
      country: overrides.country ?? "Italy",
      region: overrides.region ?? "Piedmont",
      appellation: overrides.appellation ?? "",
      grapeBlendMode: "single",
      grapeBlend: overrides.grapeBlend ?? "Nebbiolo",
      selectedGrapes: [],
      otherGrapesText: "",
      // Match v3Wine's fixed answer producer/wineName by default so a
      // "fully correct" guess in these ranking-focused tests is genuinely
      // fully correct across all seven core_v3 categories, not artificially
      // capped by an always-blank Producer/Cuvée — Producer/Cuvée matching
      // itself is covered separately in scoring.test.ts/normalize.test.ts.
      producer: overrides.producer ?? "Producer",
      wineName: overrides.wineName ?? "Cuvee",
      vintage: overrides.vintage ?? "2018",
      rating: 90,
      confidence: "medium",
    };
  }

  it("ranks by percentage accuracy, not raw points: a taster who only saw an 80-point wine and aced it outranks one who scored 90/100 on a 100-point wine", () => {
    const session: TastingSession = {
      id: "s1",
      code: "MAROON-1",
      title: "Mixed Denominator Tasting",
      date: "2026-01-01",
      status: "revealed",
      createdAt: "2026-01-01T00:00:00Z",
      scoringVersion: "core_v3_appellation_conditional",
      wines: [v3Wine("w1", "Bottle 1"), v3Wine("w2", "Bottle 2", "Barolo")],
    };
    const submissions: GuestSubmission[] = [
      {
        id: "a",
        guestId: "a",
        guestName: "Alice",
        sessionCode: session.code,
        locked: true,
        // Only guesses the 120-point wine, fully correct: 120/120 = 100%.
        guesses: [v3Guess("w1")],
      },
      {
        id: "b",
        guestId: "b",
        guestName: "Ben",
        sessionCode: session.code,
        locked: true,
        // Guesses the 140-point wine, wrong on Appellation only: 120/140 ≈ 85.7%.
        guesses: [v3Guess("w2", { appellation: "Barbaresco" })],
      },
    ];

    const results = calculateTasterResults(session, submissions);
    const alice = results.find((r) => r.guestId === "a")!;
    const ben = results.find((r) => r.guestId === "b")!;

    expect(alice.totalPoints).toBe(120);
    expect(alice.totalPossible).toBe(120);
    expect(alice.overallAccuracyPercent).toBe(100);
    expect(ben.totalPoints).toBe(120);
    expect(ben.totalPossible).toBe(140);
    expect(ben.overallAccuracyPercent).toBe(85.7);
    expect(alice.rank).toBe(1);
    expect(ben.rank).toBe(2);
  });

  it("excludes bottles the taster never submitted a guess for from both the earned and possible totals", () => {
    const session: TastingSession = {
      id: "s1",
      code: "MAROON-1",
      title: "Partial Participation",
      date: "2026-01-01",
      status: "revealed",
      createdAt: "2026-01-01T00:00:00Z",
      scoringVersion: "core_v3_appellation_conditional",
      wines: [v3Wine("w1", "Bottle 1"), v3Wine("w2", "Bottle 2", "Barolo")],
    };
    const submissions: GuestSubmission[] = [
      {
        id: "a",
        guestId: "a",
        guestName: "Alice",
        sessionCode: session.code,
        locked: true,
        guesses: [v3Guess("w1")], // never guessed w2
      },
    ];
    const results = calculateTasterResults(session, submissions);
    expect(results[0].totalPossible).toBe(120);
    expect(results[0].submittedGuessCount).toBe(1);
  });

  it("displays raw totals and possible totals accurately alongside the percentage", () => {
    const session: TastingSession = {
      id: "s1",
      code: "MAROON-1",
      title: "Display Check",
      date: "2026-01-01",
      status: "revealed",
      createdAt: "2026-01-01T00:00:00Z",
      scoringVersion: "core_v3_appellation_conditional",
      wines: [v3Wine("w1", "Bottle 1", "Barolo")],
    };
    const submissions: GuestSubmission[] = [
      {
        id: "a",
        guestId: "a",
        guestName: "Alice",
        sessionCode: session.code,
        locked: true,
        guesses: [v3Guess("w1", { appellation: "Barolo" })],
      },
    ];
    const results = calculateTasterResults(session, submissions);
    expect(results[0].totalPoints).toBe(140);
    expect(results[0].totalPossible).toBe(140);
    expect(results[0].overallAccuracyPercent).toBe(100);
  });

  it("breaks a percentage tie using raw points earned, then submitted-guess count", () => {
    const session: TastingSession = {
      id: "s1",
      code: "MAROON-1",
      title: "Tie Break",
      date: "2026-01-01",
      status: "revealed",
      createdAt: "2026-01-01T00:00:00Z",
      scoringVersion: "core_v3_appellation_conditional",
      wines: [v3Wine("w1", "Bottle 1"), v3Wine("w2", "Bottle 2")],
    };
    const submissions: GuestSubmission[] = [
      {
        // 100% on one bottle only: 120/120.
        id: "a",
        guestId: "a",
        guestName: "Alice",
        sessionCode: session.code,
        locked: true,
        guesses: [v3Guess("w1")],
      },
      {
        // 100% on both bottles: 240/240 — same percentage, more raw points and more submitted guesses.
        id: "b",
        guestId: "b",
        guestName: "Ben",
        sessionCode: session.code,
        locked: true,
        guesses: [v3Guess("w1"), v3Guess("w2")],
      },
    ];
    const results = calculateTasterResults(session, submissions);
    const alice = results.find((r) => r.guestId === "a")!;
    const ben = results.find((r) => r.guestId === "b")!;
    expect(alice.overallAccuracyPercent).toBe(100);
    expect(ben.overallAccuracyPercent).toBe(100);
    expect(ben.rank).toBe(1);
    expect(alice.rank).toBe(2);
  });
});

describe("calculateTasterResults ranking (core_v4_partial_credit)", () => {
  // core_v4_partial_credit shares calculateTasterResultsPercentageBased with
  // core_v3_appellation_conditional (see lib/results.ts) — the exhaustive
  // percentage-ranking/mixed-denominator/tie-break coverage lives in the
  // core_v3 describe block above and needs no duplicating here. These two
  // tests only confirm the rename/broadened dispatcher actually routes a
  // third scoring version correctly.
  function v4Wine(id: string, code: string): WineAnswerKey {
    return {
      id,
      code,
      country: "Italy",
      region: "Piedmont",
      grapeBlendMode: "single",
      grapeBlend: "Nebbiolo",
      producer: "Producer",
      wineName: "Cuvee",
      vintage: "2018",
      wineStyle: "red",
      tastingOrder: 1,
    };
  }

  function v4Guess(wineId: string, overrides: Partial<WineAnswerKey> = {}): GuestSubmission["guesses"][number] {
    return {
      wineId,
      country: overrides.country ?? "Italy",
      region: overrides.region ?? "Piedmont",
      appellation: "",
      grapeBlendMode: "single",
      grapeBlend: overrides.grapeBlend ?? "Nebbiolo",
      selectedGrapes: [],
      otherGrapesText: "",
      producer: overrides.producer ?? "Producer",
      wineName: overrides.wineName ?? "Cuvee",
      vintage: overrides.vintage ?? "2018",
      rating: 90,
      confidence: "medium",
    };
  }

  it("routes a core_v4_partial_credit session through the same percentage-based ranking core_v3 uses", () => {
    const session: TastingSession = {
      id: "s1",
      code: "MAROON-1",
      title: "Partial Credit Tasting",
      date: "2026-01-01",
      status: "revealed",
      createdAt: "2026-01-01T00:00:00Z",
      scoringVersion: "core_v4_partial_credit",
      wines: [v4Wine("w1", "Bottle 1")],
    };
    const submissions: GuestSubmission[] = [
      {
        id: "a",
        guestId: "a",
        guestName: "Alice",
        sessionCode: session.code,
        locked: true,
        guesses: [v4Guess("w1")],
      },
    ];
    const results = calculateTasterResults(session, submissions);
    expect(results[0].totalPoints).toBe(120);
    expect(results[0].totalPossible).toBe(120);
    expect(results[0].overallAccuracyPercent).toBe(100);
  });

  it("reflects partial credit in the taster's total, not just full-or-nothing", () => {
    const session: TastingSession = {
      id: "s1",
      code: "MAROON-1",
      title: "Partial Credit Tasting",
      date: "2026-01-01",
      status: "revealed",
      createdAt: "2026-01-01T00:00:00Z",
      scoringVersion: "core_v4_partial_credit",
      wines: [v4Wine("w1", "Bottle 1")],
    };
    const submissions: GuestSubmission[] = [
      {
        id: "a",
        guestId: "a",
        guestName: "Alice",
        sessionCode: session.code,
        locked: true,
        // Vintage one year off: half credit (10/20) instead of 0 or 20 —
        // total 110/120 rather than either extreme.
        guesses: [v4Guess("w1", { vintage: "2019" })],
      },
    ];
    const results = calculateTasterResults(session, submissions);
    expect(results[0].totalPoints).toBe(110);
    expect(results[0].totalPossible).toBe(120);
  });
});

describe("buildTastingReport empty state", () => {
  it("produces empty leaderboard and no superlatives when nobody submitted", () => {
    const session: TastingSession = {
      id: "s1",
      code: "MAROON-1",
      title: "Empty Tasting",
      date: "2026-01-01",
      status: "revealed",
      createdAt: "2026-01-01T00:00:00Z",
      wines: [makeWine("w1", "Wine A")],
      scoringVersion: "legacy_v1",
    };
    const report = buildTastingReport(session, []);
    expect(report.tasterResults).toEqual([]);
    expect(report.bestTaster).toEqual([]);
    expect(report.wineOfTheNight).toEqual([]);
    expect(report.wineResults[0].numRatings).toBe(0);
  });
});
