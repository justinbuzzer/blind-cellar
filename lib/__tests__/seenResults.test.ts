import { describe, expect, it } from "vitest";
import {
  buildSeenTastingReport,
  calculateSeenBottleResults,
  calculateSeenMostDivisiveWine,
  calculateSeenWineOfTheNight,
  orderSeenBottleResultsByRank,
  SeenRatingRow,
} from "@/lib/seenResults";
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

describe("calculateSeenBottleResults", () => {
  it("labels a participant who never rated a bottle as null, not a fabricated zero", () => {
    const wines = [makeWine()];
    const ratings: SeenRatingRow[] = [{ wineId: "wine-1", guestId: "g1", rating: 90 }];

    const [result] = calculateSeenBottleResults(wines, guests, ratings);

    expect(result.participantRatings).toHaveLength(3);
    const bob = result.participantRatings.find((p) => p.guestId === "g2");
    expect(bob?.rating).toBeNull();
    expect(result.numRatings).toBe(1);
    expect(result.averageRating).toBe(90);
  });

  it("computes average/low/high/spread only from actual ratings", () => {
    const wines = [makeWine()];
    const ratings: SeenRatingRow[] = [
      { wineId: "wine-1", guestId: "g1", rating: 80 },
      { wineId: "wine-1", guestId: "g2", rating: 90 },
    ];

    const [result] = calculateSeenBottleResults(wines, guests, ratings);

    expect(result.numRatings).toBe(2);
    expect(result.averageRating).toBe(85);
    expect(result.lowestRating).toBe(80);
    expect(result.highestRating).toBe(90);
    expect(result.ratingSpread).toBe(10);
  });

  it("carries a participant's optional tasting note through", () => {
    const wines = [makeWine()];
    const ratings: SeenRatingRow[] = [
      { wineId: "wine-1", guestId: "g1", rating: 88, note: "Bright acidity" },
    ];

    const [result] = calculateSeenBottleResults(wines, guests, ratings);
    const alice = result.participantRatings.find((p) => p.guestId === "g1");
    expect(alice?.note).toBe("Bright acidity");
  });

  it("ranks bottles by average rating, then lower spread, then more ratings, sharing a rank on a genuine tie", () => {
    const wines = [
      makeWine({ id: "wine-1", tastingOrder: 1 }),
      makeWine({ id: "wine-2", tastingOrder: 2 }),
      makeWine({ id: "wine-3", tastingOrder: 3 }),
      makeWine({ id: "wine-4", tastingOrder: 4 }),
    ];
    const ratings: SeenRatingRow[] = [
      // wine-1: avg 90, spread 0 (tight, high) -> rank 1
      { wineId: "wine-1", guestId: "g1", rating: 90 },
      { wineId: "wine-1", guestId: "g2", rating: 90 },
      // wine-2: avg 85, spread 10, 2 ratings -> ties wine-3 on avg+spread, but has fewer ratings
      { wineId: "wine-2", guestId: "g1", rating: 80 },
      { wineId: "wine-2", guestId: "g2", rating: 90 },
      // wine-3: avg 85, spread 10, 3 ratings -> beats wine-2 on rating count -> rank 2
      { wineId: "wine-3", guestId: "g1", rating: 80 },
      { wineId: "wine-3", guestId: "g2", rating: 90 },
      { wineId: "wine-3", guestId: "g3", rating: 85 },
      // wine-4: no ratings at all -> last
    ];

    const results = calculateSeenBottleResults(wines, guests, ratings);
    const byId = new Map(results.map((r) => [r.wine.id, r]));

    expect(byId.get("wine-1")!.rank).toBe(1);
    expect(byId.get("wine-3")!.rank).toBe(2);
    expect(byId.get("wine-2")!.rank).toBe(3);
    expect(byId.get("wine-4")!.rank).toBe(4);
    expect(byId.get("wine-4")!.averageRating).toBeNull();
  });

  it("shares a rank when two bottles are fully tied on average, spread, and rating count", () => {
    const wines = [
      makeWine({ id: "wine-1", tastingOrder: 1 }),
      makeWine({ id: "wine-2", tastingOrder: 2 }),
    ];
    const ratings: SeenRatingRow[] = [
      { wineId: "wine-1", guestId: "g1", rating: 80 },
      { wineId: "wine-1", guestId: "g2", rating: 90 },
      { wineId: "wine-2", guestId: "g1", rating: 80 },
      { wineId: "wine-2", guestId: "g2", rating: 90 },
    ];

    const results = calculateSeenBottleResults(wines, guests, ratings);
    expect(results[0].rank).toBe(results[1].rank);
  });
});

describe("orderSeenBottleResultsByRank", () => {
  it("orders best rank first", () => {
    const wines = [
      makeWine({ id: "wine-1", tastingOrder: 1 }),
      makeWine({ id: "wine-2", tastingOrder: 2 }),
    ];
    const ratings: SeenRatingRow[] = [
      { wineId: "wine-1", guestId: "g1", rating: 70 },
      { wineId: "wine-2", guestId: "g1", rating: 95 },
    ];

    const results = calculateSeenBottleResults(wines, guests, ratings);
    const ordered = orderSeenBottleResultsByRank(results);
    expect(ordered[0].wine.id).toBe("wine-2");
    expect(ordered[1].wine.id).toBe("wine-1");
  });
});

describe("calculateSeenWineOfTheNight / calculateSeenMostDivisiveWine", () => {
  it("picks the highest average rating, breaking ties with lower spread", () => {
    const wines = [
      makeWine({ id: "wine-1", tastingOrder: 1 }),
      makeWine({ id: "wine-2", tastingOrder: 2 }),
    ];
    const ratings: SeenRatingRow[] = [
      { wineId: "wine-1", guestId: "g1", rating: 80 },
      { wineId: "wine-1", guestId: "g2", rating: 90 }, // avg 85, spread 10
      { wineId: "wine-2", guestId: "g1", rating: 84 },
      { wineId: "wine-2", guestId: "g2", rating: 86 }, // avg 85, spread 2
    ];

    const results = calculateSeenBottleResults(wines, guests, ratings);
    const winner = calculateSeenWineOfTheNight(results);
    expect(winner).toHaveLength(1);
    expect(winner[0].wine.id).toBe("wine-2");
  });

  it("returns the largest-spread bottle as most divisive", () => {
    const wines = [
      makeWine({ id: "wine-1", tastingOrder: 1 }),
      makeWine({ id: "wine-2", tastingOrder: 2 }),
    ];
    const ratings: SeenRatingRow[] = [
      { wineId: "wine-1", guestId: "g1", rating: 50 },
      { wineId: "wine-1", guestId: "g2", rating: 100 }, // spread 50
      { wineId: "wine-2", guestId: "g1", rating: 88 },
      { wineId: "wine-2", guestId: "g2", rating: 90 }, // spread 2
    ];

    const results = calculateSeenBottleResults(wines, guests, ratings);
    const mostDivisive = calculateSeenMostDivisiveWine(results);
    expect(mostDivisive).toHaveLength(1);
    expect(mostDivisive[0].wine.id).toBe("wine-1");
  });
});

describe("buildSeenTastingReport", () => {
  it("reports totals and never includes blind-identification scoring fields", () => {
    const wines = [makeWine({ id: "wine-1" }), makeWine({ id: "wine-2", tastingOrder: 2 })];
    const ratings: SeenRatingRow[] = [
      { wineId: "wine-1", guestId: "g1", rating: 90 },
      { wineId: "wine-1", guestId: "g2", rating: 80 },
      { wineId: "wine-2", guestId: "g1", rating: 95 },
    ];

    const report = buildSeenTastingReport(wines, guests, ratings);

    expect(report.totalBottles).toBe(2);
    expect(report.totalRatings).toBe(3);
    expect(report.totalRaters).toBe(2); // g1 and g2, not g3
    expect(report.wineOfTheNight).toHaveLength(1);
    expect(report.bottleResults).toHaveLength(2);
    expect(report).not.toHaveProperty("bestTaster");
    expect(report).not.toHaveProperty("tasterResults");
  });

  it("never counts a guest who has no non-null rating anywhere as a rater", () => {
    const wines = [makeWine()];
    const report = buildSeenTastingReport(wines, guests, []);
    expect(report.totalRaters).toBe(0);
    expect(report.totalRatings).toBe(0);
    expect(report.bottleResults[0].averageRating).toBeNull();
  });
});
