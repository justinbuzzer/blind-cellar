import { describe, expect, it } from "vitest";
import {
  BETTABLE_FIELDS,
  SettlementWine,
  buildCreditLedger,
  findMyLedgerEntry,
  settleBottleBets,
  settleFieldBet,
} from "@/lib/betting";
import { CreditLedgerResponse } from "@/lib/supabase/types";
import { WineGuess } from "@/types/tasting";

const wine: SettlementWine = {
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
  contributorGuestId: "guest-host",
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

describe("BETTABLE_FIELDS", () => {
  it("covers exactly the seven core_v4_partial_credit categories", () => {
    expect(BETTABLE_FIELDS).toEqual([
      "country",
      "region",
      "appellation",
      "grapeBlend",
      "vintage",
      "producer",
      "wineName",
    ]);
  });
});

describe("settleFieldBet — country/region (binary, no partial credit)", () => {
  it("an exact match wins the full bet", () => {
    const result = settleFieldBet("country", 10, makeGuess(), wine);
    expect(result.fieldScore.correct).toBe(true);
    expect(result.guesserDelta).toBe(10);
  });

  it("a miss loses the full bet", () => {
    const result = settleFieldBet("country", 10, makeGuess({ country: "France" }), wine);
    expect(result.fieldScore.correct).toBe(false);
    expect(result.guesserDelta).toBe(-10);
  });

  it("a zero bet never transfers anything, win or lose", () => {
    expect(settleFieldBet("region", 0, makeGuess(), wine).guesserDelta).toBe(0);
    expect(settleFieldBet("region", 0, makeGuess({ region: "Tuscany" }), wine).guesserDelta).toBe(0);
  });
});

describe("settleFieldBet — appellation (conditional applicability)", () => {
  it("wins the full bet on an exact match when the wine has an appellation", () => {
    const wineWithAppellation: SettlementWine = { ...wine, appellation: "Barolo" };
    const result = settleFieldBet(
      "appellation",
      10,
      makeGuess({ appellation: "Barolo" }),
      wineWithAppellation
    );
    expect(result.fieldScore.applicable).toBe(true);
    expect(result.guesserDelta).toBe(10);
  });

  it("loses the full bet on a miss when the wine has an appellation", () => {
    const wineWithAppellation: SettlementWine = { ...wine, appellation: "Barolo" };
    const result = settleFieldBet(
      "appellation",
      10,
      makeGuess({ appellation: "Barbaresco" }),
      wineWithAppellation
    );
    expect(result.guesserDelta).toBe(-10);
  });

  it("never transfers anything when the wine has no recorded appellation, regardless of the bet", () => {
    const result = settleFieldBet("appellation", 10, makeGuess({ appellation: "Barolo" }), wine);
    expect(result.fieldScore.applicable).toBe(false);
    expect(result.guesserDelta).toBe(0);
  });
});

describe("settleFieldBet — vintage (half credit at exactly 1 year off)", () => {
  it("wins the full bet on an exact match", () => {
    expect(settleFieldBet("vintage", 10, makeGuess(), wine).guesserDelta).toBe(10);
  });

  it("loses only half the bet when one year off", () => {
    const result = settleFieldBet("vintage", 10, makeGuess({ vintage: "2015" }), wine);
    expect(result.fieldScore.correct).toBe(false);
    expect(result.fieldScore.points).toBe(5);
    expect(result.guesserDelta).toBe(-5);
  });

  it("loses the full bet two or more years off", () => {
    const result = settleFieldBet("vintage", 10, makeGuess({ vintage: "2013" }), wine);
    expect(result.guesserDelta).toBe(-10);
  });

  it("loses the full bet for an NV-vs-year mismatch (no numeric distance to award partial credit against)", () => {
    const result = settleFieldBet("vintage", 10, makeGuess({ vintage: "NV" }), wine);
    expect(result.guesserDelta).toBe(-10);
  });
});

describe("settleFieldBet — grapeBlend (Jaccard-proportional partial credit)", () => {
  const blendWine: SettlementWine = {
    ...wine,
    grapeBlendMode: "blend",
    grapeBlend: "Cabernet Sauvignon / Merlot / Petit Verdot",
  };

  it("wins the full bet on an exact set match", () => {
    const result = settleFieldBet(
      "grapeBlend",
      12,
      makeGuess({ grapeBlendMode: "blend", grapeBlend: "Cabernet Sauvignon / Merlot / Petit Verdot" }),
      blendWine
    );
    expect(result.guesserDelta).toBe(12);
  });

  it("loses a fraction of the bet proportional to the missing overlap (2 of 3 shared)", () => {
    const result = settleFieldBet(
      "grapeBlend",
      12,
      makeGuess({ grapeBlendMode: "blend", grapeBlend: "Cabernet Sauvignon / Merlot" }),
      blendWine
    );
    // Jaccard overlap = 2/3 -> points = round(12 * 2/3) = 8 -> loses 12 - 8 = 4.
    expect(result.fieldScore.points).toBe(8);
    expect(result.guesserDelta).toBe(-4);
  });

  it("loses the full bet on a mode mismatch, even with textual overlap", () => {
    const result = settleFieldBet(
      "grapeBlend",
      12,
      makeGuess({ grapeBlendMode: "single", grapeBlend: "Cabernet Sauvignon" }),
      blendWine
    );
    expect(result.fieldScore.points).toBe(0);
    expect(result.guesserDelta).toBe(-12);
  });
});

describe("settleFieldBet — producer/wineName (close-spelling half credit)", () => {
  it("wins the full bet on an exact match", () => {
    expect(settleFieldBet("producer", 10, makeGuess(), wine).guesserDelta).toBe(10);
  });

  it("loses only half the bet on a small typo within the partial-credit distance", () => {
    const result = settleFieldBet("producer", 10, makeGuess({ producer: "Giacomo Contero" }), wine);
    expect(result.fieldScore.correct).toBe(false);
    expect(result.fieldScore.points).toBe(5);
    expect(result.guesserDelta).toBe(-5);
  });

  it("loses the full bet on a materially different name", () => {
    const result = settleFieldBet("wineName", 10, makeGuess({ wineName: "Totally Different Cuvee" }), wine);
    expect(result.guesserDelta).toBe(-10);
  });

  it("loses the full bet on a blank guess — never awards partial credit for nothing", () => {
    const result = settleFieldBet("producer", 10, makeGuess({ producer: "" }), wine);
    expect(result.guesserDelta).toBe(-10);
  });
});

describe("settleBottleBets", () => {
  it("sums one guesser's field deltas into a single net, and negates the total for the contributor", () => {
    const settlement = settleBottleBets(wine, [
      {
        guestId: "guest-a",
        guestName: "Alice",
        guess: makeGuess({ country: "France" }), // country wrong
        bets: { country: 10, vintage: 10 }, // vintage exact
      },
    ]);

    const alice = settlement.guessers[0];
    expect(alice.netDelta).toBe(0); // -10 (country) + 10 (vintage) = 0
    expect(settlement.contributorDelta).toBe(0);
  });

  it("aggregates multiple guessers' independent bilateral outcomes against the same contributor", () => {
    const settlement = settleBottleBets(wine, [
      { guestId: "guest-a", guestName: "Alice", guess: makeGuess(), bets: { country: 10 } }, // wins +10
      {
        guestId: "guest-b",
        guestName: "Ben",
        guess: makeGuess({ country: "France" }),
        bets: { country: 10 },
      }, // loses -10
    ]);

    expect(settlement.guessers.find((g) => g.guestId === "guest-a")?.netDelta).toBe(10);
    expect(settlement.guessers.find((g) => g.guestId === "guest-b")?.netDelta).toBe(-10);
    // Zero-sum: contributor's net is the negated sum of every guesser (+10 - 10 = 0 here).
    expect(settlement.contributorDelta).toBe(0);
  });

  it("returns a null contributorDelta when the bottle has no recorded contributor", () => {
    const settlement = settleBottleBets(
      { ...wine, contributorGuestId: null },
      [{ guestId: "guest-a", guestName: "Alice", guess: makeGuess(), bets: { country: 10 } }]
    );
    expect(settlement.contributorDelta).toBeNull();
  });
});

function ledgerResponse(): CreditLedgerResponse {
  return {
    scoringVersion: "core_v4_partial_credit",
    myGuestId: "guest-a",
    guests: [
      { id: "guest-host", displayName: "Host", startingCredits: 100 },
      { id: "guest-a", displayName: "Alice", startingCredits: 100 },
      { id: "guest-b", displayName: "Ben", startingCredits: 50 },
    ],
    wines: [
      {
        id: "wine-1",
        anonymousCode: "Bottle 1",
        bottleNumber: 1,
        country: "Italy",
        region: "Piedmont",
        appellation: null,
        grapeBlendMode: "single",
        grapeBlend: "Nebbiolo",
        producer: "Giacomo Conterno",
        wineCuvee: "Cascina Francia",
        vintage: "2016",
        tastingOrder: 1,
        contributorGuestId: "guest-host",
      },
    ],
    guesses: [
      {
        wineId: "wine-1",
        guestId: "guest-a",
        guestName: "Alice",
        lockedAt: "2026-01-01T00:00:00Z",
        countryGuess: "Italy",
        regionGuess: "Piedmont",
        appellationGuess: null,
        grapeBlendMode: "single",
        grapeBlendGuess: "Nebbiolo",
        producerGuess: "Giacomo Conterno",
        wineCuveeGuess: "Cascina Francia",
        vintageGuess: "2016",
        countryBet: 10,
        regionBet: 0,
        appellationBet: 0,
        grapeBlendBet: 0,
        vintageBet: 0,
        producerBet: 0,
        wineCuveeBet: 0,
      },
      {
        wineId: "wine-1",
        guestId: "guest-b",
        guestName: "Ben",
        lockedAt: "2026-01-01T00:00:00Z",
        countryGuess: "France",
        regionGuess: "Piedmont",
        appellationGuess: null,
        grapeBlendMode: "single",
        grapeBlendGuess: "Nebbiolo",
        producerGuess: "Giacomo Conterno",
        wineCuveeGuess: "Cascina Francia",
        vintageGuess: "2016",
        countryBet: 5,
        regionBet: 0,
        appellationBet: 0,
        grapeBlendBet: 0,
        vintageBet: 0,
        producerBet: 0,
        wineCuveeBet: 0,
      },
    ],
  };
}

describe("buildCreditLedger", () => {
  it("derives each guest's current balance from startingCredits plus every revealed wine's settlement", () => {
    const { entries } = buildCreditLedger(ledgerResponse());

    const alice = entries.find((e) => e.guestId === "guest-a");
    const ben = entries.find((e) => e.guestId === "guest-b");
    const host = entries.find((e) => e.guestId === "guest-host");

    // Alice: country correct, bet 10 -> +10. Ben: country wrong, bet 5 -> -5.
    expect(alice?.currentBalance).toBe(110);
    expect(ben?.currentBalance).toBe(45);
    // Host (contributor): loses to Alice (-10), wins from Ben (+5) -> net -5.
    expect(host?.currentBalance).toBe(95);
  });

  it("ranks entries descending by current balance", () => {
    const { entries } = buildCreditLedger(ledgerResponse());
    const balances = entries.map((e) => e.currentBalance);
    expect(balances).toEqual([...balances].sort((a, b) => b - a));
  });

  it("never settles an unlocked/draft guess's bets", () => {
    const response = ledgerResponse();
    response.guesses[0].lockedAt = null;
    const { entries } = buildCreditLedger(response);
    const alice = entries.find((e) => e.guestId === "guest-a");
    // Alice's draft country bet never settles -> stays at her starting balance.
    expect(alice?.currentBalance).toBe(100);
  });

  it("treats a missing startingCredits as zero rather than throwing", () => {
    const response = ledgerResponse();
    response.guests[1].startingCredits = null;
    const { entries } = buildCreditLedger(response);
    expect(entries.find((e) => e.guestId === "guest-a")?.startingCredits).toBe(0);
  });
});

describe("findMyLedgerEntry", () => {
  it("returns the caller's own entry, never fabricating one that isn't present", () => {
    const { entries } = buildCreditLedger(ledgerResponse());
    expect(findMyLedgerEntry(entries, "guest-a")?.guestName).toBe("Alice");
    expect(findMyLedgerEntry(entries, "guest-nonexistent")).toBeUndefined();
  });
});
