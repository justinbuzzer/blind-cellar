import { describe, expect, it } from "vitest";
import {
  buildFinalLeaderboardView,
  buildBottleResultView,
  buildHostRecapBottleSummaries,
  buildParticipantBottleTotals,
  buildProvisionalLeaderboard,
  findGuessByGuestId,
  findMyTasterResult,
  formatBottleAggregateSummary,
  formatHostRecapBottleLine,
  formatLeaderboardPercent,
  withYouSuffix,
} from "@/lib/resultsReveal";
import {
  BottleResultForHostResponse,
  FinalLeaderboardResponse,
  BottleResultGuessDTO,
  LeaderboardGuessDTO,
  LeaderboardWineDTO,
  ProvisionalLeaderboardResponse,
  RevealedBottleWineDTO,
} from "@/lib/supabase/types";

function makeWine(overrides: Partial<RevealedBottleWineDTO> = {}): RevealedBottleWineDTO {
  return {
    id: "wine-1",
    bottleNumber: 3,
    anonymousCode: "Bottle 3",
    position: 2,
    totalBottles: 6,
    country: "France",
    region: "Burgundy",
    appellation: "Volnay",
    grapeBlendMode: "single",
    grapeBlend: "Pinot Noir",
    producer: "Domaine X",
    wineCuvee: "Les Caillerets",
    vintage: "2019",
    wineStyle: "red",
    contributorName: "Alice",
    contributorStyleSequence: 1,
    photoPath: null,
    ...overrides,
  };
}

function makeGuess(overrides: Partial<BottleResultGuessDTO> = {}): BottleResultGuessDTO {
  return {
    countryGuess: "France",
    regionGuess: "Burgundy",
    appellationGuess: "Volnay",
    grapeBlendMode: "single",
    grapeBlendGuess: "Pinot Noir",
    producerGuess: "Domaine X",
    wineCuveeGuess: "Les Caillerets",
    vintageGuess: "2019",
    rating: 90,
    ...overrides,
  };
}

function makeHostResponse(
  overrides: Partial<BottleResultForHostResponse> = {}
): BottleResultForHostResponse {
  return {
    session: { publicId: "session-1", status: "collecting", scoringVersion: "core_v3_appellation_conditional" },
    wine: makeWine(),
    participants: [],
    ...overrides,
  };
}

describe("buildBottleResultView", () => {
  it("scores every submitted participant with the exact same field-by-field breakdown scoreWineGuess produces", () => {
    const response = makeHostResponse({
      participants: [
        { guestName: "Alice", submitted: true, guess: makeGuess() },
        { guestName: "Bob", submitted: true, guess: makeGuess({ countryGuess: "Italy" }) },
      ],
    });
    const view = buildBottleResultView(response);
    expect(view.participants).toHaveLength(2);
    const alice = view.participants.find((p) => p.guestName === "Alice")!;
    expect(alice.score?.totalPoints).toBe(140); // 120 core + 20 appellation, all correct
    expect(alice.score?.fieldScores.find((f) => f.field === "country")?.correct).toBe(true);
    const bob = view.participants.find((p) => p.guestName === "Bob")!;
    expect(bob.score?.fieldScores.find((f) => f.field === "country")?.correct).toBe(false);
    expect(bob.score!.totalPoints).toBeLessThan(alice.score!.totalPoints);
  });

  it("never fabricates a score for a participant with no submitted guess", () => {
    const response = makeHostResponse({
      participants: [{ guestName: "Carol", submitted: false, guess: null }],
    });
    const view = buildBottleResultView(response);
    expect(view.participants[0].score).toBeNull();
    expect(view.aggregate.submittedCount).toBe(0);
    expect(view.aggregate.averageScore).toBeNull();
  });

  it("uses the bottle's own denominator (140 when Appellation applies) uniformly across every participant", () => {
    const response = makeHostResponse({
      participants: [
        { guestName: "Alice", submitted: true, guess: makeGuess() },
        { guestName: "Bob", submitted: true, guess: makeGuess({ appellationGuess: "Pommard" }) },
      ],
    });
    const view = buildBottleResultView(response);
    expect(view.aggregate.totalPossiblePoints).toBe(140);
    expect(view.aggregate.highestScore).toBe(140);
  });

  it("drops Appellation's denominator to 120 and never penalizes a guess when the wine has no recorded Appellation", () => {
    const response = makeHostResponse({
      wine: makeWine({ appellation: null }),
      participants: [{ guestName: "Alice", submitted: true, guess: makeGuess({ appellationGuess: null }) }],
    });
    const view = buildBottleResultView(response);
    const alice = view.participants[0];
    expect(alice.score?.totalPossiblePoints).toBe(120);
    expect(alice.score?.fieldScores.find((f) => f.field === "appellation")?.applicable).toBe(false);
    expect(view.aggregate.totalPossiblePoints).toBe(120);
  });

  it("computes average/highest/perfect-score count only across submitted guesses", () => {
    const response = makeHostResponse({
      participants: [
        { guestName: "Alice", submitted: true, guess: makeGuess() },
        { guestName: "Bob", submitted: true, guess: makeGuess({ countryGuess: "Italy" }) },
        { guestName: "Carol", submitted: false, guess: null },
      ],
    });
    const view = buildBottleResultView(response);
    expect(view.aggregate.eligibleCount).toBe(3);
    expect(view.aggregate.submittedCount).toBe(2);
    expect(view.aggregate.perfectScoreCount).toBe(1);
    expect(view.aggregate.averageScore).toBe((140 + 120) / 2);
  });
});

describe("formatBottleAggregateSummary", () => {
  it("shows the required empty-state copy when nobody has submitted yet", () => {
    const summary = formatBottleAggregateSummary({
      eligibleCount: 3,
      submittedCount: 0,
      averageScore: null,
      highestScore: null,
      totalPossiblePoints: null,
      perfectScoreCount: 0,
    });
    expect(summary).toBe("No submitted guesses to score yet.");
  });

  it("shows the native per-bottle denominator once someone has submitted", () => {
    const summary = formatBottleAggregateSummary({
      eligibleCount: 3,
      submittedCount: 2,
      averageScore: 72,
      highestScore: 90,
      totalPossiblePoints: 100,
      perfectScoreCount: 0,
    });
    expect(summary).toBe("Average score: 72 / 100");
  });
});

function makeLeaderboardWine(overrides: Partial<LeaderboardWineDTO> = {}): LeaderboardWineDTO {
  return {
    id: "wine-1",
    anonymousCode: "Bottle 1",
    bottleNumber: 1,
    country: "France",
    region: "Burgundy",
    appellation: "Volnay",
    grapeBlendMode: "single",
    grapeBlend: "Pinot Noir",
    producer: "Domaine X",
    wineCuvee: "Les Caillerets",
    vintage: "2019",
    wineStyle: "red",
    tastingOrder: 1,
    photoPath: null,
    ...overrides,
  };
}

function makeLeaderboardGuess(overrides: Partial<LeaderboardGuessDTO> = {}): LeaderboardGuessDTO {
  return {
    wineId: "wine-1",
    guestId: "g1",
    guestName: "Alice",
    lockedAt: "2026-08-01T00:00:00Z",
    countryGuess: "France",
    regionGuess: "Burgundy",
    appellationGuess: "Volnay",
    grapeBlendMode: "single",
    grapeBlendGuess: "Pinot Noir",
    producerGuess: "Domaine X",
    wineCuveeGuess: "Les Caillerets",
    vintageGuess: "2019",
    rating: 90,
    ...overrides,
  };
}

function makeLeaderboardResponse(
  overrides: Partial<ProvisionalLeaderboardResponse> = {}
): ProvisionalLeaderboardResponse {
  return {
    wines: [makeLeaderboardWine()],
    guesses: [],
    guests: [],
    scoringVersion: "core_v3_appellation_conditional",
    sessionStatus: "collecting",
    tastingMode: "full_blind",
    totalCount: 3,
    revealedCount: 1,
    ...overrides,
  };
}

describe("buildProvisionalLeaderboard", () => {
  it("ranks by percentage accuracy, primarily, using only revealed-bottle data it was handed", () => {
    const response = makeLeaderboardResponse({
      guesses: [
        makeLeaderboardGuess({ guestId: "g1", guestName: "Alice" }),
        makeLeaderboardGuess({ guestId: "g2", guestName: "Bob", countryGuess: "Italy" }),
      ],
      guests: [
        { id: "g1", displayName: "Alice", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g2", displayName: "Bob", completedAt: "2026-08-01T00:00:00Z" },
      ],
    });
    const view = buildProvisionalLeaderboard(response);
    expect(view.tasterResults[0].guestName).toBe("Alice");
    expect(view.tasterResults[0].rank).toBe(1);
    expect(view.tasterResults[1].guestName).toBe("Bob");
    expect(view.tasterResults[1].rank).toBe(2);
  });

  it("excludes a full_blind guest who has not completed their session-wide submission", () => {
    const response = makeLeaderboardResponse({
      guesses: [makeLeaderboardGuess({ guestId: "g1", guestName: "Alice" })],
      guests: [
        { id: "g1", displayName: "Alice", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g2", displayName: "Bob", completedAt: null },
      ],
    });
    const view = buildProvisionalLeaderboard(response);
    expect(view.tasterResults.map((t) => t.guestName)).toEqual(["Alice"]);
  });

  it("includes a blind_match guest the same way as full_blind — gated on completedAt, not a mode-specific branch", () => {
    // blind_match has no self-submit button (continuous revision until the
    // host ends the tasting, like Seen) — end_match_tasting bulk-stamps
    // every guest's completedAt at reveal time instead, specifically so this
    // falls into the exact same buildRevealedSubmissions path full_blind
    // already uses, with zero new branching in buildRankedResults.
    const response = makeLeaderboardResponse({
      tastingMode: "blind_match",
      guesses: [makeLeaderboardGuess({ guestId: "g1", guestName: "Alice" })],
      guests: [
        { id: "g1", displayName: "Alice", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g2", displayName: "Bob", completedAt: null },
      ],
    });
    const view = buildProvisionalLeaderboard(response);
    expect(view.tasterResults.map((t) => t.guestName)).toEqual(["Alice"]);
  });

  it("scopes a course_reveal leaderboard to locked guesses only, independent of completedAt", () => {
    const response = makeLeaderboardResponse({
      tastingMode: "course_reveal",
      guesses: [
        makeLeaderboardGuess({ guestId: "g1", guestName: "Alice", lockedAt: "2026-08-01T00:00:00Z" }),
        makeLeaderboardGuess({ guestId: "g2", guestName: "Bob", lockedAt: null }),
      ],
      guests: [
        { id: "g1", displayName: "Alice", completedAt: null },
        { id: "g2", displayName: "Bob", completedAt: null },
      ],
    });
    const view = buildProvisionalLeaderboard(response);
    expect(view.tasterResults.map((t) => t.guestName)).toEqual(["Alice"]);
  });

  it("breaks a genuine tie alphabetically by display name while sharing the same rank", () => {
    const response = makeLeaderboardResponse({
      guesses: [
        makeLeaderboardGuess({ guestId: "g1", guestName: "Zoe" }),
        makeLeaderboardGuess({ guestId: "g2", guestName: "Amy" }),
      ],
      guests: [
        { id: "g1", displayName: "Zoe", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g2", displayName: "Amy", completedAt: "2026-08-01T00:00:00Z" },
      ],
    });
    const view = buildProvisionalLeaderboard(response);
    expect(view.tasterResults.map((t) => t.guestName)).toEqual(["Amy", "Zoe"]);
    expect(view.tasterResults[0].rank).toBe(view.tasterResults[1].rank);
  });

  it("reports allRevealed only once every bottle in the session has been revealed", () => {
    const notAllRevealed = buildProvisionalLeaderboard(
      makeLeaderboardResponse({ revealedCount: 2, totalCount: 3 })
    );
    expect(notAllRevealed.allRevealed).toBe(false);

    const allRevealed = buildProvisionalLeaderboard(
      makeLeaderboardResponse({ revealedCount: 3, totalCount: 3 })
    );
    expect(allRevealed.allRevealed).toBe(true);

    const noWinesYet = buildProvisionalLeaderboard(
      makeLeaderboardResponse({ revealedCount: 0, totalCount: 0 })
    );
    expect(noWinesYet.allRevealed).toBe(false);
  });

  it("also returns per-bottle wineResults built from the same submissions, for the host's expandable per-participant detail", () => {
    const response = makeLeaderboardResponse({
      guesses: [
        makeLeaderboardGuess({ guestId: "g1", guestName: "Alice" }),
        makeLeaderboardGuess({ guestId: "g2", guestName: "Bob", countryGuess: "Italy" }),
      ],
      guests: [
        { id: "g1", displayName: "Alice", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g2", displayName: "Bob", completedAt: "2026-08-01T00:00:00Z" },
      ],
    });
    const view = buildProvisionalLeaderboard(response);
    expect(view.wineResults).toHaveLength(1);
    expect(view.wineResults[0].guesses).toHaveLength(2);
    expect(view.wineResults[0].guesses.find((g) => g.guestId === "g1")?.totalPoints).toBe(140);
  });
});

// --- Final leaderboard + tasting recap (participant) ---

function makeFinalLeaderboardResponse(
  overrides: Partial<FinalLeaderboardResponse> = {}
): FinalLeaderboardResponse {
  return {
    wines: [makeLeaderboardWine()],
    guesses: [],
    guests: [],
    scoringVersion: "core_v3_appellation_conditional",
    sessionStatus: "revealed",
    tastingMode: "full_blind",
    totalCount: 1,
    revealedCount: 1,
    title: "Friday Night Flight",
    tastingDate: "2026-08-01",
    myGuestId: "g1",
    ...overrides,
  };
}

describe("buildFinalLeaderboardView", () => {
  it("ranks participants using the exact same shared pipeline as the host provisional leaderboard", () => {
    const response = makeFinalLeaderboardResponse({
      guesses: [
        makeLeaderboardGuess({ guestId: "g1", guestName: "Alice" }),
        makeLeaderboardGuess({ guestId: "g2", guestName: "Bob", countryGuess: "Italy" }),
      ],
      guests: [
        { id: "g1", displayName: "Alice", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g2", displayName: "Bob", completedAt: "2026-08-01T00:00:00Z" },
      ],
    });
    const view = buildFinalLeaderboardView(response);
    expect(view.tasterResults[0]).toMatchObject({ guestName: "Alice", rank: 1 });
    expect(view.tasterResults[1]).toMatchObject({ guestName: "Bob", rank: 2 });
    expect(view.myGuestId).toBe("g1");
    expect(view.title).toBe("Friday Night Flight");
  });

  it("ranks mixed 80-point and 100-point bottles fairly via percentage, not raw points", () => {
    const noAppellationWine = makeLeaderboardWine({
      id: "wine-2",
      anonymousCode: "Bottle 2",
      appellation: null,
      tastingOrder: 2,
    });
    const response = makeFinalLeaderboardResponse({
      wines: [makeLeaderboardWine(), noAppellationWine],
      guesses: [
        // Alice: 80/100 on the 100-point bottle (wrong vintage only) = 80%,
        // 80 raw points.
        makeLeaderboardGuess({ wineId: "wine-1", guestId: "g1", guestName: "Alice", vintageGuess: "2018" }),
        // Bob: perfect on the 80-point bottle = 100%, also 80 raw points.
        // Equal raw points but a higher percentage — a raw-points comparison
        // would wrongly call this a tie or even favor Alice.
        makeLeaderboardGuess({
          wineId: "wine-2",
          guestId: "g2",
          guestName: "Bob",
          appellationGuess: null,
        }),
      ],
      guests: [
        { id: "g1", displayName: "Alice", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g2", displayName: "Bob", completedAt: "2026-08-01T00:00:00Z" },
      ],
    });
    const view = buildFinalLeaderboardView(response);
    const alice = view.tasterResults.find((t) => t.guestName === "Alice")!;
    const bob = view.tasterResults.find((t) => t.guestName === "Bob")!;
    expect(alice.totalPoints).toBe(bob.totalPoints); // equal raw points...
    expect(bob.overallAccuracyPercent).toBeGreaterThan(alice.overallAccuracyPercent); // ...but Bob's bottle was fully correct
    expect(bob.rank).toBe(1);
    expect(alice.rank).toBe(2);
  });

  it("assigns competition ranks 1, 2, 2, 4 across a four-way field with one tie", () => {
    const response = makeFinalLeaderboardResponse({
      guesses: [
        makeLeaderboardGuess({ guestId: "g1", guestName: "Ava" }), // 100%
        makeLeaderboardGuess({ guestId: "g2", guestName: "Daniel", vintageGuess: "2018" }), // wrong vintage
        makeLeaderboardGuess({ guestId: "g3", guestName: "Mia", vintageGuess: "2018" }), // same as Daniel — tie
        makeLeaderboardGuess({ guestId: "g4", guestName: "Noah", countryGuess: "Spain", regionGuess: "Rioja", vintageGuess: "2018" }),
      ],
      guests: [
        { id: "g1", displayName: "Ava", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g2", displayName: "Daniel", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g3", displayName: "Mia", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g4", displayName: "Noah", completedAt: "2026-08-01T00:00:00Z" },
      ],
    });
    const view = buildFinalLeaderboardView(response);
    const ranks = view.tasterResults.map((t) => t.rank);
    expect(ranks).toEqual([1, 2, 2, 4]);
  });
});

describe("findMyTasterResult / findGuessByGuestId", () => {
  it("returns undefined (never a fabricated score) when the viewer has no counted score", () => {
    const response = makeFinalLeaderboardResponse({
      guesses: [makeLeaderboardGuess({ guestId: "g2", guestName: "Bob" })],
      guests: [
        { id: "g1", displayName: "Alice", completedAt: null },
        { id: "g2", displayName: "Bob", completedAt: "2026-08-01T00:00:00Z" },
      ],
      myGuestId: "g1",
    });
    const view = buildFinalLeaderboardView(response);
    expect(findMyTasterResult(view.tasterResults, "g1")).toBeUndefined();
    expect(findGuessByGuestId(view.wineResults[0], "g1")).toBeUndefined();
  });

  it("finds the viewer's own row/guess and never another participant's", () => {
    const response = makeFinalLeaderboardResponse({
      guesses: [
        makeLeaderboardGuess({ guestId: "g1", guestName: "Alice" }),
        makeLeaderboardGuess({ guestId: "g2", guestName: "Bob", countryGuess: "Italy" }),
      ],
      guests: [
        { id: "g1", displayName: "Alice", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g2", displayName: "Bob", completedAt: "2026-08-01T00:00:00Z" },
      ],
      myGuestId: "g2",
    });
    const view = buildFinalLeaderboardView(response);
    const mine = findMyTasterResult(view.tasterResults, "g2");
    expect(mine?.guestName).toBe("Bob");
    const myGuess = findGuessByGuestId(view.wineResults[0], "g2");
    expect(myGuess?.fieldScores.find((f) => f.field === "country")?.correct).toBe(false);
  });
});

describe("formatLeaderboardPercent / withYouSuffix", () => {
  it("formats to one decimal place", () => {
    expect(formatLeaderboardPercent(84)).toBe("84.0%");
    expect(formatLeaderboardPercent(77.777)).toBe("77.8%");
  });

  it("appends the exact existing ' (you)' convention only for the viewer's own row", () => {
    expect(withYouSuffix("Ava", true)).toBe("Ava (you)");
    expect(withYouSuffix("Ava", false)).toBe("Ava");
  });
});

// --- Host recap: per-bottle aggregate overview ---

describe("buildHostRecapBottleSummaries / formatHostRecapBottleLine", () => {
  it("shows the exact required empty-state copy when a bottle has no submitted guesses", () => {
    const response = makeLeaderboardResponse({ guesses: [], guests: [] });
    const view = buildProvisionalLeaderboard(response);
    const summaries = buildHostRecapBottleSummaries(view.wineResults);
    expect(summaries[0].submittedCount).toBe(0);
    expect(formatHostRecapBottleLine(summaries[0])).toBe("No submitted guesses to score.");
  });

  it("averages each guess's own normalized percentage, never raw points, and reports highest in native form", () => {
    const response = makeLeaderboardResponse({
      guesses: [
        makeLeaderboardGuess({ guestId: "g1", guestName: "Alice" }), // 140/140
        makeLeaderboardGuess({ guestId: "g2", guestName: "Bob", countryGuess: "Italy" }), // 120/140
      ],
      guests: [
        { id: "g1", displayName: "Alice", completedAt: "2026-08-01T00:00:00Z" },
        { id: "g2", displayName: "Bob", completedAt: "2026-08-01T00:00:00Z" },
      ],
    });
    const view = buildProvisionalLeaderboard(response);
    const summaries = buildHostRecapBottleSummaries(view.wineResults);
    expect(summaries[0].submittedCount).toBe(2);
    expect(summaries[0].averagePercent).toBe(92.9); // (100 + 85.7) / 2
    expect(summaries[0].highestScore).toEqual({ earned: 140, possible: 140 });
    expect(formatHostRecapBottleLine(summaries[0])).toBe("2 submitted · Average 92.9% · Highest 140 / 140");
  });
});

describe("buildParticipantBottleTotals", () => {
  it("returns every bottle's safe code with this participant's own guess only, never another's", () => {
    const secondWine = makeLeaderboardWine({ id: "wine-2", anonymousCode: "Bottle 2", tastingOrder: 2 });
    const response = makeLeaderboardResponse({
      wines: [makeLeaderboardWine(), secondWine],
      guesses: [makeLeaderboardGuess({ wineId: "wine-1", guestId: "g1", guestName: "Alice" })],
      guests: [{ id: "g1", displayName: "Alice", completedAt: "2026-08-01T00:00:00Z" }],
    });
    const view = buildProvisionalLeaderboard(response);
    const totals = buildParticipantBottleTotals(view.wineResults, "g1");
    expect(totals).toHaveLength(2);
    expect(totals[0]).toMatchObject({ code: "Bottle 1" });
    expect(totals[0].guess?.totalPoints).toBe(140);
    expect(totals[1]).toMatchObject({ code: "Bottle 2", guess: null });
  });
});
