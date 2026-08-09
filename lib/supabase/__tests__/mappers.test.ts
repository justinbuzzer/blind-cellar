import { describe, expect, it } from "vitest";
import {
  buildCourseRevealSubmissions,
  buildRevealedBottleResult,
  mapGuestGuessDtoToWineGuess,
} from "@/lib/supabase/mappers";
import { GuestGuessDTO, RevealedBottleResponse, RevealedWineGuessRow } from "@/lib/supabase/types";

function makeGuessDto(overrides: Partial<GuestGuessDTO> = {}): GuestGuessDTO {
  return {
    wineId: "wine-1",
    countryGuess: "",
    regionGuess: "",
    appellationGuess: null,
    grapeBlendMode: "single",
    grapeBlendGuess: "",
    selectedGrapes: [],
    otherGrapesText: "",
    producerGuess: "",
    wineCuveeGuess: "",
    vintageGuess: "",
    rating: null,
    confidence: "medium",
    tastingNote: null,
    ...overrides,
  };
}

function makeGuessRow(overrides: Partial<RevealedWineGuessRow> = {}): RevealedWineGuessRow {
  return {
    id: "guess-1",
    session_id: "session-1",
    wine_id: "wine-1",
    guest_id: "guest-1",
    country_guess: "Italy",
    region_guess: "Piedmont",
    appellation_guess: null,
    grape_style_guess: "Nebbiolo",
    grape_blend_mode: "single",
    producer_guess: "",
    wine_cuvee_guess: "",
    vintage_guess: "",
    rating: 90,
    confidence: "high",
    tasting_note: null,
    submitted_at: "2026-08-05T00:00:00Z",
    locked_at: "2026-08-05T00:05:00Z",
    ...overrides,
  };
}

function makeResponse(
  overrides: Partial<RevealedBottleResponse["wine"]> = {},
  guesses: RevealedBottleResponse["guesses"] = []
): RevealedBottleResponse {
  return {
    session: { publicId: "session-1", status: "collecting", scoringVersion: "legacy_v1" },
    wine: {
      id: "wine-1",
      bottleNumber: 3,
      anonymousCode: "Bottle 3",
      position: 2,
      totalBottles: 6,
      country: "Italy",
      region: "Piedmont",
      appellation: "Barolo",
      grapeBlendMode: "single",
      grapeBlend: "Nebbiolo",
      producer: "Giacomo Conterno",
      wineCuvee: "Cascina Francia",
      vintage: "2016",
      wineStyle: "red",
      contributorName: "Alice",
      ...overrides,
    },
    submitted: guesses.length > 0,
    guesses,
  };
}

describe("buildRevealedBottleResult", () => {
  it("carries the answer key through, including the anonymous code and contributor", () => {
    const result = buildRevealedBottleResult(makeResponse());
    expect(result.wine.code).toBe("Bottle 3");
    expect(result.wine.producer).toBe("Giacomo Conterno");
    expect(result.wine.wineStyle).toBe("red");
    expect(result.wine.contributorName).toBe("Alice");
    expect(result.wine.appellation).toBe("Barolo");
  });

  it("maps a null appellation to undefined, not the literal string 'null'", () => {
    const result = buildRevealedBottleResult(makeResponse({ appellation: null }));
    expect(result.wine.appellation).toBeUndefined();
  });

  it("scores a perfect single-variety guess via the existing scoring pipeline (100 core + 20 bonus)", () => {
    const response = makeResponse({}, [
      {
        guestId: "guest-1",
        guestName: "Bob",
        countryGuess: "Italy",
        regionGuess: "Piedmont",
        appellationGuess: "Barolo",
        grapeBlendMode: "single",
        grapeBlendGuess: "Nebbiolo",
        producerGuess: "Giacomo Conterno",
        wineCuveeGuess: "Cascina Francia",
        vintageGuess: "2016",
        rating: 92,
        confidence: "high",
      },
    ]);

    const result = buildRevealedBottleResult(response);
    expect(result.guesses).toHaveLength(1);
    expect(result.guesses[0].totalPoints).toBe(120);
    expect(result.averageRating).toBe(92);
    expect(result.numRatings).toBe(1);
  });

  it("carries the appellation guess through for display without affecting the 120-point total", () => {
    const response = makeResponse({}, [
      {
        guestId: "guest-1",
        guestName: "Bob",
        countryGuess: "Italy",
        regionGuess: "Piedmont",
        appellationGuess: "Barbaresco",
        grapeBlendMode: "single",
        grapeBlendGuess: "Nebbiolo",
        producerGuess: "Giacomo Conterno",
        wineCuveeGuess: "Cascina Francia",
        vintageGuess: "2016",
        rating: 92,
        confidence: "high",
      },
    ]);

    const result = buildRevealedBottleResult(response);
    expect(result.guesses[0].appellationGuess).toBe("Barbaresco");
    // A wrong appellation guess (answer is Barolo) still scores full marks —
    // appellation is never part of scoring.
    expect(result.guesses[0].totalPoints).toBe(120);
  });

  it("only includes guesses the server returned — a guest with no locked guess is simply absent, not a fabricated zero score", () => {
    const result = buildRevealedBottleResult(makeResponse());
    expect(result.guesses).toHaveLength(0);
    expect(result.numRatings).toBe(0);
    expect(result.averageRating).toBeNull();
  });

  it("computes group rating stats (average/low/high/spread) across multiple guesses", () => {
    const response = makeResponse({}, [
      {
        guestId: "g1",
        guestName: "Bob",
        countryGuess: "",
        regionGuess: "",
        appellationGuess: null,
        grapeBlendMode: null,
        grapeBlendGuess: "",
        producerGuess: "",
        wineCuveeGuess: "",
        vintageGuess: "",
        rating: 80,
        confidence: "medium",
      },
      {
        guestId: "g2",
        guestName: "Carol",
        countryGuess: "",
        regionGuess: "",
        appellationGuess: null,
        grapeBlendMode: null,
        grapeBlendGuess: "",
        producerGuess: "",
        wineCuveeGuess: "",
        vintageGuess: "",
        rating: 90,
        confidence: "medium",
      },
    ]);

    const result = buildRevealedBottleResult(response);
    expect(result.numRatings).toBe(2);
    expect(result.lowestRating).toBe(80);
    expect(result.highestRating).toBe(90);
    expect(result.ratingSpread).toBe(10);
    expect(result.averageRating).toBe(85);
  });
});

describe("buildCourseRevealSubmissions", () => {
  const guests = [
    { id: "guest-1", displayName: "Alice" },
    { id: "guest-2", displayName: "Bob" },
  ];

  it("includes a guest's locked guesses, keyed off wine_guesses.locked_at rather than guests.completed_at", () => {
    const rows = [makeGuessRow({ guest_id: "guest-1", wine_id: "wine-1" })];
    const submissions = buildCourseRevealSubmissions(rows, guests);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].guestId).toBe("guest-1");
    expect(submissions[0].guestName).toBe("Alice");
    expect(submissions[0].guesses).toHaveLength(1);
  });

  it("excludes a guess that was never locked, instead of fabricating a submission for it", () => {
    const rows = [makeGuessRow({ guest_id: "guest-2", locked_at: null })];
    const submissions = buildCourseRevealSubmissions(rows, guests);
    expect(submissions).toHaveLength(0);
  });

  it("keeps a guest's locked guesses for bottles they submitted even if they skipped another bottle", () => {
    const rows = [
      makeGuessRow({ guest_id: "guest-1", wine_id: "wine-1", locked_at: "2026-08-05T00:05:00Z" }),
      makeGuessRow({ guest_id: "guest-1", wine_id: "wine-2", locked_at: null }),
    ];
    const submissions = buildCourseRevealSubmissions(rows, guests);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].guesses).toHaveLength(1);
    expect(submissions[0].guesses[0].wineId).toBe("wine-1");
  });
});

describe("mapGuestGuessDtoToWineGuess — Other grape", () => {
  it("restores the Other grape selector and custom text for an unrecognised single-variety draft", () => {
    const guess = mapGuestGuessDtoToWineGuess(makeGuessDto({ grapeBlendGuess: "Mondeuse Blanche" }));
    expect(guess.otherGrapeSelected).toBe(true);
    expect(guess.grapeBlend).toBe("Mondeuse Blanche");
  });

  it("leaves otherGrapeSelected false for a curated single-variety draft", () => {
    const guess = mapGuestGuessDtoToWineGuess(makeGuessDto({ grapeBlendGuess: "Chardonnay" }));
    expect(guess.otherGrapeSelected).toBe(false);
  });

  it("leaves otherGrapeSelected false for a blend draft", () => {
    const guess = mapGuestGuessDtoToWineGuess(
      makeGuessDto({ grapeBlendMode: "blend", grapeBlendGuess: "Cabernet Sauvignon / Merlot" })
    );
    expect(guess.otherGrapeSelected).toBe(false);
  });
});
