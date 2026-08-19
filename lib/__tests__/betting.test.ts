import { describe, expect, it } from "vitest";
import {
  BETTABLE_FIELDS,
  BetMultipliers,
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

/** Uniform 1.5x odds on every field, used by tests that aren't specifically about per-field odds variance. */
const UNIFORM_ODDS: BetMultipliers = {
  country: 1.5,
  region: 1.5,
  appellation: 1.5,
  grapeBlend: 1.5,
  vintage: 1.5,
  producer: 1.5,
  wineName: 1.5,
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

describe("settleFieldBet — country/region (binary, odds-scaled win)", () => {
  it("an exact match wins (multiplier - 1) * bet", () => {
    const result = settleFieldBet("country", 10, 1.3, makeGuess(), wine);
    expect(result.correct).toBe(true);
    expect(result.guesserDelta).toBe(3); // round((1.3 - 1) * 10) = 3
  });

  it("a miss loses the full bet regardless of odds", () => {
    const result = settleFieldBet("country", 10, 1.3, makeGuess({ country: "France" }), wine);
    expect(result.correct).toBe(false);
    expect(result.guesserDelta).toBe(-10);
  });

  it("a zero bet never transfers anything, win or lose", () => {
    expect(settleFieldBet("region", 0, 1.5, makeGuess(), wine).guesserDelta).toBe(0);
    expect(settleFieldBet("region", 0, 1.5, makeGuess({ region: "Tuscany" }), wine).guesserDelta).toBe(0);
  });

  it("rounds a non-whole-number payout to the nearest credit", () => {
    // (1.3 - 1) * 7 = 2.1 -> rounds to 2.
    const result = settleFieldBet("country", 7, 1.3, makeGuess(), wine);
    expect(result.guesserDelta).toBe(2);
  });
});

describe("settleFieldBet — appellation (conditional applicability)", () => {
  it("wins the odds-scaled payout on an exact match when the wine has an appellation", () => {
    const wineWithAppellation: SettlementWine = { ...wine, appellation: "Barolo" };
    const result = settleFieldBet(
      "appellation",
      10,
      1.5,
      makeGuess({ appellation: "Barolo" }),
      wineWithAppellation
    );
    expect(result.correct).toBe(true);
    expect(result.guesserDelta).toBe(5); // round((1.5 - 1) * 10) = 5
  });

  it("loses the full bet on a miss when the wine has an appellation", () => {
    const wineWithAppellation: SettlementWine = { ...wine, appellation: "Barolo" };
    const result = settleFieldBet(
      "appellation",
      10,
      1.5,
      makeGuess({ appellation: "Barbaresco" }),
      wineWithAppellation
    );
    expect(result.guesserDelta).toBe(-10);
  });

  it("never transfers anything when the wine has no recorded appellation, regardless of the bet", () => {
    const result = settleFieldBet("appellation", 10, 1.5, makeGuess({ appellation: "Barolo" }), wine);
    expect(result.correct).toBe(false);
    expect(result.guesserDelta).toBe(0);
  });
});

describe("settleFieldBet — vintage (binary — no more partial credit for a near miss)", () => {
  it("wins the odds-scaled payout on an exact match", () => {
    expect(settleFieldBet("vintage", 10, 1.4, makeGuess(), wine).guesserDelta).toBe(4);
  });

  it("loses the full bet even when only one year off (used to earn half credit — betting has no partial credit now)", () => {
    const result = settleFieldBet("vintage", 10, 1.4, makeGuess({ vintage: "2015" }), wine);
    expect(result.correct).toBe(false);
    expect(result.guesserDelta).toBe(-10);
  });

  it("loses the full bet two or more years off", () => {
    const result = settleFieldBet("vintage", 10, 1.4, makeGuess({ vintage: "2013" }), wine);
    expect(result.guesserDelta).toBe(-10);
  });

  it("loses the full bet for an NV-vs-year mismatch", () => {
    const result = settleFieldBet("vintage", 10, 1.4, makeGuess({ vintage: "NV" }), wine);
    expect(result.guesserDelta).toBe(-10);
  });
});

describe("settleFieldBet — grapeBlend (binary — no more Jaccard partial credit)", () => {
  const blendWine: SettlementWine = {
    ...wine,
    grapeBlendMode: "blend",
    grapeBlend: "Cabernet Sauvignon / Merlot / Petit Verdot",
  };

  it("wins the odds-scaled payout on an exact set match", () => {
    const result = settleFieldBet(
      "grapeBlend",
      12,
      2.0,
      makeGuess({ grapeBlendMode: "blend", grapeBlend: "Cabernet Sauvignon / Merlot / Petit Verdot" }),
      blendWine
    );
    expect(result.guesserDelta).toBe(12); // round((2.0 - 1) * 12) = 12
  });

  it("loses the full bet on a partial overlap (2 of 3 shared — used to earn proportional credit)", () => {
    const result = settleFieldBet(
      "grapeBlend",
      12,
      2.0,
      makeGuess({ grapeBlendMode: "blend", grapeBlend: "Cabernet Sauvignon / Merlot" }),
      blendWine
    );
    expect(result.correct).toBe(false);
    expect(result.guesserDelta).toBe(-12);
  });

  it("loses the full bet on a mode mismatch, even with textual overlap", () => {
    const result = settleFieldBet(
      "grapeBlend",
      12,
      2.0,
      makeGuess({ grapeBlendMode: "single", grapeBlend: "Cabernet Sauvignon" }),
      blendWine
    );
    expect(result.guesserDelta).toBe(-12);
  });
});

describe("settleFieldBet — producer/wineName (binary — no more close-spelling partial credit)", () => {
  it("wins the odds-scaled payout on an exact match", () => {
    expect(settleFieldBet("producer", 10, 2.5, makeGuess(), wine).guesserDelta).toBe(15);
  });

  it("loses the full bet on a small typo within the old partial-credit distance", () => {
    const result = settleFieldBet("producer", 10, 2.5, makeGuess({ producer: "Giacomo Contero" }), wine);
    expect(result.correct).toBe(false);
    expect(result.guesserDelta).toBe(-10);
  });

  it("loses the full bet on a materially different name", () => {
    const result = settleFieldBet("wineName", 10, 2.5, makeGuess({ wineName: "Totally Different Cuvee" }), wine);
    expect(result.guesserDelta).toBe(-10);
  });

  it("loses the full bet on a blank guess", () => {
    const result = settleFieldBet("producer", 10, 2.5, makeGuess({ producer: "" }), wine);
    expect(result.guesserDelta).toBe(-10);
  });
});

describe("settleBottleBets", () => {
  it("sums one guesser's field deltas into a single net, and negates the total for the contributor", () => {
    const settlement = settleBottleBets(
      wine,
      [
        {
          guestId: "guest-a",
          guestName: "Alice",
          guess: makeGuess({ country: "France" }), // country wrong -> -10
          bets: { country: 10, vintage: 10 }, // vintage exact -> +(1.5-1)*10 = 5
        },
      ],
      UNIFORM_ODDS
    );

    const alice = settlement.guessers[0];
    expect(alice.netDelta).toBe(-5); // -10 (country) + 5 (vintage) = -5
    expect(settlement.contributorDelta).toBe(5);
  });

  it("aggregates multiple guessers' independent bilateral outcomes against the same contributor, using each field's own odds", () => {
    const multipliers: BetMultipliers = { ...UNIFORM_ODDS, country: 1.3 };
    const settlement = settleBottleBets(
      wine,
      [
        { guestId: "guest-a", guestName: "Alice", guess: makeGuess(), bets: { country: 10 } }, // wins +3
        {
          guestId: "guest-b",
          guestName: "Ben",
          guess: makeGuess({ country: "France" }),
          bets: { country: 10 },
        }, // loses -10
      ],
      multipliers
    );

    expect(settlement.guessers.find((g) => g.guestId === "guest-a")?.netDelta).toBe(3);
    expect(settlement.guessers.find((g) => g.guestId === "guest-b")?.netDelta).toBe(-10);
    // Zero-sum: contributor's net is the negated sum of every guesser (+3 - 10 = -7 -> contributor +7).
    expect(settlement.contributorDelta).toBe(7);
  });

  it("returns a null contributorDelta when the bottle has no recorded contributor", () => {
    const settlement = settleBottleBets(
      { ...wine, contributorGuestId: null },
      [{ guestId: "guest-a", guestName: "Alice", guess: makeGuess(), bets: { country: 10 } }],
      UNIFORM_ODDS
    );
    expect(settlement.contributorDelta).toBeNull();
  });
});

function ledgerResponse(): CreditLedgerResponse {
  return {
    scoringVersion: "core_v4_partial_credit",
    myGuestId: "guest-a",
    countryBetMultiplier: 1.3,
    regionBetMultiplier: 1.5,
    appellationBetMultiplier: 1.5,
    grapeBlendBetMultiplier: 2.0,
    vintageBetMultiplier: 1.5,
    producerBetMultiplier: 2.5,
    wineCuveeBetMultiplier: 2.5,
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
        countryBet: 10, // exact -> round((1.3-1)*10) = +3
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
        countryBet: 5, // wrong -> -5
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

    // Alice: country correct, bet 10 @ 1.3x -> +3. Ben: country wrong, bet 5 -> -5.
    expect(alice?.currentBalance).toBe(103);
    expect(ben?.currentBalance).toBe(45);
    // Host (contributor): loses to Alice (-3), wins from Ben (+5) -> net +2.
    expect(host?.currentBalance).toBe(102);
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

  it("leaves every guest at their starting balance when the response has no odds config (non-betting session)", () => {
    const response = ledgerResponse();
    response.countryBetMultiplier = null;
    const { entries } = buildCreditLedger(response);
    expect(entries.find((e) => e.guestId === "guest-a")?.currentBalance).toBe(100);
    expect(entries.find((e) => e.guestId === "guest-b")?.currentBalance).toBe(50);
    expect(entries.find((e) => e.guestId === "guest-host")?.currentBalance).toBe(100);
  });
});

describe("findMyLedgerEntry", () => {
  it("returns the caller's own entry, never fabricating one that isn't present", () => {
    const { entries } = buildCreditLedger(ledgerResponse());
    expect(findMyLedgerEntry(entries, "guest-a")?.guestName).toBe("Alice");
    expect(findMyLedgerEntry(entries, "guest-nonexistent")).toBeUndefined();
  });
});
