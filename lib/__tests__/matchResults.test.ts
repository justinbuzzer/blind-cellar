import { describe, expect, it } from "vitest";
import {
  buildMatchTastingReport,
  calculateMatchBottleResults,
  calculateMatchMostDivisiveWine,
  calculateMatchTasterResults,
  calculateMatchWineOfTheNight,
  MatchGuessRow,
  orderMatchBottleResultsByRank,
} from "@/lib/matchResults";
import { WineAnswerKey } from "@/types/tasting";

function makeWine(overrides: Partial<WineAnswerKey> = {}): WineAnswerKey {
  return {
    id: "wine-1",
    code: "Bottle 1",
    country: "Italy",
    region: "Piedmont",
    grapeBlendMode: "single",
    grapeBlend: "Nebbiolo",
    producer: "Giacomo Conterno",
    wineName: "Cascina Francia",
    vintage: "2016",
    wineStyle: "red",
    tastingOrder: 1,
    ...overrides,
  };
}

const guests = [
  { id: "g1", displayName: "Alice" },
  { id: "g2", displayName: "Bob" },
  { id: "g3", displayName: "Carol" },
];

describe("calculateMatchBottleResults", () => {
  it("scores a matched wine as correct and marks a wrong pick as incorrect", () => {
    const wines = [makeWine({ id: "wine-1" }), makeWine({ id: "wine-2", tastingOrder: 2 })];
    const rows: MatchGuessRow[] = [
      { wineId: "wine-1", guestId: "g1", matchedWineId: "wine-1", rating: 90 },
      { wineId: "wine-1", guestId: "g2", matchedWineId: "wine-2", rating: 85 },
    ];

    const [result] = calculateMatchBottleResults(wines, guests, rows);
    const alice = result.participantPicks.find((p) => p.guestId === "g1");
    const bob = result.participantPicks.find((p) => p.guestId === "g2");

    expect(alice?.correct).toBe(true);
    expect(alice?.pickedWine?.id).toBe("wine-1");
    expect(bob?.correct).toBe(false);
    expect(bob?.pickedWine?.id).toBe("wine-2");
    expect(result.correctCount).toBe(1);
    expect(result.totalPicks).toBe(2);
  });

  it("labels a participant who never picked as null, not a fabricated wrong", () => {
    const wines = [makeWine()];
    const rows: MatchGuessRow[] = [
      { wineId: "wine-1", guestId: "g1", matchedWineId: "wine-1", rating: 90 },
    ];

    const [result] = calculateMatchBottleResults(wines, guests, rows);
    expect(result.participantPicks).toHaveLength(3);
    const carol = result.participantPicks.find((p) => p.guestId === "g3");
    expect(carol?.pickedWine).toBeNull();
    expect(carol?.correct).toBeNull();
    expect(result.totalPicks).toBe(1);
  });

  it("computes rating stats only from actual ratings, same as Seen", () => {
    const wines = [makeWine()];
    const rows: MatchGuessRow[] = [
      { wineId: "wine-1", guestId: "g1", matchedWineId: "wine-1", rating: 80 },
      { wineId: "wine-1", guestId: "g2", matchedWineId: null, rating: 90 },
    ];

    const [result] = calculateMatchBottleResults(wines, guests, rows);
    expect(result.numRatings).toBe(2);
    expect(result.averageRating).toBe(85);
    expect(result.lowestRating).toBe(80);
    expect(result.highestRating).toBe(90);
    expect(result.ratingSpread).toBe(10);
  });

  it("carries a participant's optional tasting note through", () => {
    const wines = [makeWine()];
    const rows: MatchGuessRow[] = [
      { wineId: "wine-1", guestId: "g1", matchedWineId: "wine-1", rating: 88, note: "Tannic, closed" },
    ];
    const [result] = calculateMatchBottleResults(wines, guests, rows);
    expect(result.participantPicks.find((p) => p.guestId === "g1")?.note).toBe("Tannic, closed");
  });

  it("ranks bottles by average rating, same tie-break order as Seen", () => {
    const wines = [makeWine({ id: "wine-1", tastingOrder: 1 }), makeWine({ id: "wine-2", tastingOrder: 2 })];
    const rows: MatchGuessRow[] = [
      { wineId: "wine-1", guestId: "g1", matchedWineId: "wine-1", rating: 70 },
      { wineId: "wine-2", guestId: "g1", matchedWineId: "wine-2", rating: 95 },
    ];
    const results = calculateMatchBottleResults(wines, guests, rows);
    const ordered = orderMatchBottleResultsByRank(results);
    expect(ordered[0].wine.id).toBe("wine-2");
    expect(ordered[1].wine.id).toBe("wine-1");
  });
});

describe("calculateMatchTasterResults", () => {
  it("ranks tasters by correct-match count, not by rating or field overlap", () => {
    const wines = [makeWine({ id: "wine-1" }), makeWine({ id: "wine-2", tastingOrder: 2 })];
    const rows: MatchGuessRow[] = [
      // Alice gets both right.
      { wineId: "wine-1", guestId: "g1", matchedWineId: "wine-1", rating: 90 },
      { wineId: "wine-2", guestId: "g1", matchedWineId: "wine-2", rating: 90 },
      // Bob gets one right, one wrong.
      { wineId: "wine-1", guestId: "g2", matchedWineId: "wine-1", rating: 90 },
      { wineId: "wine-2", guestId: "g2", matchedWineId: "wine-1", rating: 90 },
      // Carol never picks.
    ];

    const results = calculateMatchTasterResults(wines, guests, rows);
    const byId = new Map(results.map((r) => [r.guestId, r]));

    expect(byId.get("g1")!.correctCount).toBe(2);
    expect(byId.get("g1")!.accuracyPercent).toBe(100);
    expect(byId.get("g1")!.rank).toBe(1);
    expect(byId.get("g2")!.correctCount).toBe(1);
    expect(byId.get("g2")!.accuracyPercent).toBe(50);
    expect(byId.get("g2")!.rank).toBe(2);
    expect(byId.get("g3")!.correctCount).toBe(0);
    expect(byId.get("g3")!.rank).toBe(3);
  });

  it("shares a rank and breaks ties alphabetically by name", () => {
    const wines = [makeWine()];
    const rows: MatchGuessRow[] = [
      { wineId: "wine-1", guestId: "g2", matchedWineId: "wine-1", rating: 90 }, // Bob
      { wineId: "wine-1", guestId: "g1", matchedWineId: "wine-1", rating: 80 }, // Alice
    ];
    const results = calculateMatchTasterResults(wines, guests, rows);
    expect(results[0].guestName).toBe("Alice");
    expect(results[1].guestName).toBe("Bob");
    expect(results[0].rank).toBe(results[1].rank);
  });

  it("never divides by zero when there are no bottles", () => {
    const results = calculateMatchTasterResults([], guests, []);
    expect(results.every((r) => r.accuracyPercent === 0)).toBe(true);
  });
});

describe("calculateMatchWineOfTheNight / calculateMatchMostDivisiveWine", () => {
  it("picks the highest average rating, breaking ties with lower spread — independent of correctness", () => {
    const wines = [makeWine({ id: "wine-1", tastingOrder: 1 }), makeWine({ id: "wine-2", tastingOrder: 2 })];
    const rows: MatchGuessRow[] = [
      { wineId: "wine-1", guestId: "g1", matchedWineId: "wine-2", rating: 80 }, // wrong pick, high rating
      { wineId: "wine-1", guestId: "g2", matchedWineId: null, rating: 90 }, // avg 85, spread 10
      { wineId: "wine-2", guestId: "g1", matchedWineId: "wine-2", rating: 84 },
      { wineId: "wine-2", guestId: "g2", matchedWineId: "wine-1", rating: 86 }, // avg 85, spread 2
    ];

    const results = calculateMatchBottleResults(wines, guests, rows);
    const winner = calculateMatchWineOfTheNight(results);
    expect(winner).toHaveLength(1);
    expect(winner[0].wine.id).toBe("wine-2");
  });

  it("returns the largest-spread bottle as most divisive", () => {
    const wines = [makeWine({ id: "wine-1", tastingOrder: 1 }), makeWine({ id: "wine-2", tastingOrder: 2 })];
    const rows: MatchGuessRow[] = [
      { wineId: "wine-1", guestId: "g1", matchedWineId: "wine-1", rating: 50 },
      { wineId: "wine-1", guestId: "g2", matchedWineId: "wine-1", rating: 100 }, // spread 50
      { wineId: "wine-2", guestId: "g1", matchedWineId: "wine-2", rating: 88 },
      { wineId: "wine-2", guestId: "g2", matchedWineId: "wine-2", rating: 90 }, // spread 2
    ];

    const results = calculateMatchBottleResults(wines, guests, rows);
    const mostDivisive = calculateMatchMostDivisiveWine(results);
    expect(mostDivisive).toHaveLength(1);
    expect(mostDivisive[0].wine.id).toBe("wine-1");
  });
});

describe("buildMatchTastingReport", () => {
  it("reports totals and never includes field-scoring or fabricated data", () => {
    const wines = [makeWine({ id: "wine-1" }), makeWine({ id: "wine-2", tastingOrder: 2 })];
    const rows: MatchGuessRow[] = [
      { wineId: "wine-1", guestId: "g1", matchedWineId: "wine-1", rating: 90 },
      { wineId: "wine-1", guestId: "g2", matchedWineId: "wine-1", rating: 80 },
      { wineId: "wine-2", guestId: "g1", matchedWineId: "wine-2", rating: 95 },
    ];

    const report = buildMatchTastingReport(wines, guests, rows);

    expect(report.totalBottles).toBe(2);
    expect(report.totalParticipants).toBe(3);
    expect(report.totalRatings).toBe(3);
    expect(report.totalRaters).toBe(2);
    expect(report.wineOfTheNight).toHaveLength(1);
    expect(report.bottleResults).toHaveLength(2);
    expect(report.tasterResults).toHaveLength(3);
    expect(report).not.toHaveProperty("scoringVersion");
  });

  it("never counts a guest with no ratings anywhere as a rater, and still ranks them last", () => {
    const wines = [makeWine()];
    const report = buildMatchTastingReport(wines, guests, []);
    expect(report.totalRaters).toBe(0);
    expect(report.totalRatings).toBe(0);
    expect(report.bottleResults[0].averageRating).toBeNull();
    expect(report.tasterResults.every((t) => t.correctCount === 0)).toBe(true);
  });
});
