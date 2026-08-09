import { describe, expect, it } from "vitest";
import {
  buildHostBottleResult,
  buildProvisionalLeaderboard,
  formatBottleAggregateSummary,
} from "@/lib/resultsReveal";
import {
  BottleResultForHostResponse,
  HostBottleGuessDTO,
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
    ...overrides,
  };
}

function makeGuess(overrides: Partial<HostBottleGuessDTO> = {}): HostBottleGuessDTO {
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
    confidence: "high",
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

describe("buildHostBottleResult", () => {
  it("scores every submitted participant with the exact same field-by-field breakdown scoreWineGuess produces", () => {
    const response = makeHostResponse({
      participants: [
        { guestName: "Alice", submitted: true, guess: makeGuess() },
        { guestName: "Bob", submitted: true, guess: makeGuess({ countryGuess: "Italy" }) },
      ],
    });
    const view = buildHostBottleResult(response);
    expect(view.participants).toHaveLength(2);
    const alice = view.participants.find((p) => p.guestName === "Alice")!;
    expect(alice.score?.totalPoints).toBe(100); // 80 core + 20 appellation, all correct
    expect(alice.score?.fieldScores.find((f) => f.field === "country")?.correct).toBe(true);
    const bob = view.participants.find((p) => p.guestName === "Bob")!;
    expect(bob.score?.fieldScores.find((f) => f.field === "country")?.correct).toBe(false);
    expect(bob.score!.totalPoints).toBeLessThan(alice.score!.totalPoints);
  });

  it("never fabricates a score for a participant with no submitted guess", () => {
    const response = makeHostResponse({
      participants: [{ guestName: "Carol", submitted: false, guess: null }],
    });
    const view = buildHostBottleResult(response);
    expect(view.participants[0].score).toBeNull();
    expect(view.aggregate.submittedCount).toBe(0);
    expect(view.aggregate.averageScore).toBeNull();
  });

  it("uses the bottle's own denominator (100 when Appellation applies) uniformly across every participant", () => {
    const response = makeHostResponse({
      participants: [
        { guestName: "Alice", submitted: true, guess: makeGuess() },
        { guestName: "Bob", submitted: true, guess: makeGuess({ appellationGuess: "Pommard" }) },
      ],
    });
    const view = buildHostBottleResult(response);
    expect(view.aggregate.totalPossiblePoints).toBe(100);
    expect(view.aggregate.highestScore).toBe(100);
  });

  it("drops Appellation's denominator to 80 and never penalizes a guess when the wine has no recorded Appellation", () => {
    const response = makeHostResponse({
      wine: makeWine({ appellation: null }),
      participants: [{ guestName: "Alice", submitted: true, guess: makeGuess({ appellationGuess: null }) }],
    });
    const view = buildHostBottleResult(response);
    const alice = view.participants[0];
    expect(alice.score?.totalPossiblePoints).toBe(80);
    expect(alice.score?.fieldScores.find((f) => f.field === "appellation")?.applicable).toBe(false);
    expect(view.aggregate.totalPossiblePoints).toBe(80);
  });

  it("computes average/highest/perfect-score count only across submitted guesses", () => {
    const response = makeHostResponse({
      participants: [
        { guestName: "Alice", submitted: true, guess: makeGuess() },
        { guestName: "Bob", submitted: true, guess: makeGuess({ countryGuess: "Italy" }) },
        { guestName: "Carol", submitted: false, guess: null },
      ],
    });
    const view = buildHostBottleResult(response);
    expect(view.aggregate.eligibleCount).toBe(3);
    expect(view.aggregate.submittedCount).toBe(2);
    expect(view.aggregate.perfectScoreCount).toBe(1);
    expect(view.aggregate.averageScore).toBe((100 + 80) / 2);
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
    confidence: "high",
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
});
