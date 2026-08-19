import { FieldScore, GrapeBlendMode, WineAnswerKey, WineGuess } from "@/types/tasting";
import { isNormalizedMatch } from "./normalize";
import {
  scoreCuveeWithPartialCredit,
  scoreGrapeBlend,
  scoreProducerWithPartialCredit,
  scoreVintageWithPartialCredit,
} from "./scoring";
import { rankByDescendingKeys } from "./results";

/**
 * The betting sub-mode's settlement engine (see README "Tasting modes" —
 * "Betting"). Deliberately never duplicates any scoring math: every field's
 * correctness/partial-credit fraction is computed by calling the exact same
 * lib/scoring.ts functions the accuracy-scoring pipeline already uses,
 * passing the guest's own bet amount in as `pointsAvailable` instead of a
 * fixed weight. Like every other scoring computation in this app, nothing
 * here is ever persisted — a guest's credit balance is derived live from the
 * raw bet/guess rows on every load (see buildCreditLedger).
 */
export const BETTABLE_FIELDS = [
  "country",
  "region",
  "appellation",
  "grapeBlend",
  "vintage",
  "producer",
  "wineName",
] as const;

export type BettableField = (typeof BETTABLE_FIELDS)[number];

/** One guest's chosen wager per field, in the same shape as WineGuess's own field names. 0/undefined means "no bet on this field" — never forced. */
export type FieldBets = Partial<Record<BettableField, number>>;

export interface FieldSettlement {
  field: BettableField;
  /** The amount actually wagered (never negative — see upsert_wine_guess's own validation). */
  bet: number;
  /**
   * From the guesser's perspective: positive = won this amount from the
   * bottle's contributor, negative = lost this amount to them. Always 0 when
   * `bet` is 0, and always 0 for a field the answer key doesn't apply to
   * (Appellation on a wine with none recorded) — a non-applicable field is
   * never treated as a loss, since there was nothing to guess.
   */
  guesserDelta: number;
  /** The underlying score, reused verbatim from lib/scoring.ts for display (e.g. the same Correct/Partial/Incorrect badge accuracy scoring already uses) — pointsAvailable here equals `bet`, not a fixed weight. */
  fieldScore: FieldScore;
}

/**
 * Settlement formula (see README "Tasting modes" — "Betting"): an exact
 * match wins the guesser the full bet; anything short of exact — partial
 * credit or a total miss — costs the guesser `bet - points` (a total miss
 * costs the full bet, a half-credit result costs half the bet, a grape-blend
 * guess sharing 2 of 3 grapes costs 1/3 of the bet, etc). Never a smooth
 * function of the score fraction: exact match is a genuine win, not merely
 * "no loss".
 */
function settlementDeltaFor(fieldScore: FieldScore, bet: number): number {
  if (fieldScore.applicable === false) return 0;
  const delta = fieldScore.correct ? bet : -(bet - fieldScore.points);
  return delta || 0; // normalizes -0 (e.g. a 0 bet's -(0-0)) to a plain 0
}

/**
 * Settles one bettable field for one guess against its answer key — see
 * settlementDeltaFor for the win/loss formula. Takes `Omit<WineAnswerKey,
 * "contributorGuestId">` (never reading that field itself) so both a plain
 * WineAnswerKey and the wider SettlementWine below can be passed in.
 */
export function settleFieldBet(
  field: BettableField,
  bet: number,
  guess: WineGuess,
  answer: Omit<WineAnswerKey, "contributorGuestId">
): FieldSettlement {
  const b = Math.max(0, bet);
  let fieldScore: FieldScore;

  switch (field) {
    case "country": {
      const correct = isNormalizedMatch(guess.country, answer.country);
      fieldScore = {
        field: "country",
        category: "core",
        guessedValue: guess.country.trim() || "—",
        answerValue: answer.country || "—",
        correct,
        points: correct ? b : 0,
        pointsAvailable: b,
      };
      break;
    }
    case "region": {
      const correct = isNormalizedMatch(guess.region, answer.region);
      fieldScore = {
        field: "region",
        category: "core",
        guessedValue: guess.region.trim() || "—",
        answerValue: answer.region || "—",
        correct,
        points: correct ? b : 0,
        pointsAvailable: b,
      };
      break;
    }
    case "appellation": {
      const actualAppellation = (answer.appellation ?? "").trim();
      const applicable = actualAppellation.length > 0;
      const correct = applicable ? isNormalizedMatch(guess.appellation, actualAppellation) : false;
      fieldScore = {
        field: "appellation",
        category: "core",
        guessedValue: guess.appellation.trim() || "—",
        answerValue: actualAppellation || "—",
        correct,
        points: applicable && correct ? b : 0,
        pointsAvailable: applicable ? b : 0,
        applicable,
      };
      break;
    }
    case "grapeBlend":
      fieldScore = scoreGrapeBlend(
        guess.grapeBlendMode,
        guess.grapeBlend,
        answer.grapeBlendMode,
        answer.grapeBlend,
        b,
        true
      );
      break;
    case "vintage":
      fieldScore = scoreVintageWithPartialCredit(guess.vintage, answer.vintage, b);
      break;
    case "producer":
      fieldScore = scoreProducerWithPartialCredit(guess.producer, answer.producer, b);
      break;
    case "wineName":
      fieldScore = scoreCuveeWithPartialCredit(guess.wineName, answer.wineName, b);
      break;
  }

  return { field, bet: b, guesserDelta: settlementDeltaFor(fieldScore, b), fieldScore };
}

/**
 * WineAnswerKey with its own `contributorGuestId?: string` widened to
 * `string | null` — the settlement engine needs to distinguish "no
 * contributor recorded" (null) from "not yet known" (undefined), which
 * WineAnswerKey's optional-only field can't express.
 */
export type SettlementWine = Omit<WineAnswerKey, "contributorGuestId"> & {
  contributorGuestId: string | null;
};

export interface GuesserBetSettlement {
  guestId: string;
  guestName: string;
  fields: FieldSettlement[];
  /** Sum of this guesser's field deltas for this one bottle. */
  netDelta: number;
}

export interface BottleSettlement {
  wineId: string;
  contributorGuestId: string | null;
  guessers: GuesserBetSettlement[];
  /**
   * The negated sum of every guesser's netDelta on this bottle — the
   * contributor's own net change from being every guesser's counterparty.
   * Null when the bottle has no recorded contributor (a legacy bottle
   * predating contributor tracking — see wines.contributor_guest_id), in
   * which case there is no valid counterparty for any bet on it.
   * Deliberately uncapped — see README "Tasting modes" — "Betting": a
   * contributor's balance can go negative if enough guessers win big
   * against them on one bottle.
   */
  contributorDelta: number | null;
}

/** Settles every guesser's bets against one revealed bottle. */
export function settleBottleBets(
  wine: SettlementWine,
  guessers: { guestId: string; guestName: string; guess: WineGuess; bets: FieldBets }[]
): BottleSettlement {
  const guesserSettlements: GuesserBetSettlement[] = guessers.map((g) => {
    const fields = BETTABLE_FIELDS.map((field) => settleFieldBet(field, g.bets[field] ?? 0, g.guess, wine));
    const netDelta = fields.reduce((sum, f) => sum + f.guesserDelta, 0);
    return { guestId: g.guestId, guestName: g.guestName, fields, netDelta };
  });

  const contributorDelta = wine.contributorGuestId
    ? -guesserSettlements.reduce((sum, g) => sum + g.netDelta, 0) || 0 // normalizes -0
    : null;

  return {
    wineId: wine.id,
    contributorGuestId: wine.contributorGuestId,
    guessers: guesserSettlements,
    contributorDelta,
  };
}

export interface CreditLedgerEntry {
  guestId: string;
  guestName: string;
  startingCredits: number;
  /** startingCredits plus every settled bottle's net effect on this guest, as both a guesser and (for bottles they contributed) a counterparty. */
  currentBalance: number;
  /** Standard competition ranking (ties share a rank, next rank skips) — see lib/results.ts's rankByDescendingKeys, the same convention the accuracy leaderboard uses. */
  rank: number;
}

export interface CreditLedgerView {
  /** Ranked descending by currentBalance — ties keep their original (alphabetical-by-name) relative order, matching this app's existing stable-sort ranking convention (see lib/resultsReveal.ts). */
  entries: CreditLedgerEntry[];
}

/**
 * The minimal shape buildCreditLedger needs — deliberately looser (every
 * betting-only field optional) than get_credit_ledger_for_guest's own
 * CreditLedgerResponse type, so the *same* function also accepts
 * get_provisional_leaderboard_for_host's ProvisionalLeaderboardResponse and
 * get_final_leaderboard_for_guest's FinalLeaderboardResponse directly —
 * both already carry every field here (widened alongside their existing
 * accuracy-leaderboard fields — see lib/supabase/types.ts) without needing a
 * second host-only RPC. This is the one function every credits-leaderboard
 * UI surface calls, exactly how buildProvisionalLeaderboard/
 * buildFinalLeaderboardView are the one function every accuracy-leaderboard
 * surface calls (see lib/resultsReveal.ts).
 */
export interface CreditLedgerSource {
  wines: {
    id: string;
    country: string;
    region: string;
    appellation: string | null;
    grapeBlendMode: GrapeBlendMode | null;
    grapeBlend: string;
    producer: string;
    wineCuvee: string;
    vintage: string;
    contributorGuestId?: string | null;
  }[];
  guesses: {
    wineId: string;
    guestId: string;
    guestName: string;
    lockedAt: string | null;
    countryGuess: string;
    regionGuess: string;
    appellationGuess: string | null;
    grapeBlendMode: GrapeBlendMode | null;
    grapeBlendGuess: string;
    producerGuess: string;
    wineCuveeGuess: string;
    vintageGuess: string;
    countryBet?: number | null;
    regionBet?: number | null;
    appellationBet?: number | null;
    grapeBlendBet?: number | null;
    vintageBet?: number | null;
    producerBet?: number | null;
    wineCuveeBet?: number | null;
  }[];
  guests: { id: string; displayName: string; startingCredits?: number | null }[];
}

function mapLedgerWineToAnswerKey(w: CreditLedgerSource["wines"][number]): SettlementWine {
  return {
    id: w.id,
    code: "",
    country: w.country,
    region: w.region,
    appellation: w.appellation ?? undefined,
    grapeBlendMode: w.grapeBlendMode ?? "",
    grapeBlend: w.grapeBlend,
    producer: w.producer,
    wineName: w.wineCuvee,
    vintage: w.vintage,
    wineStyle: "other",
    tastingOrder: 0,
    contributorGuestId: w.contributorGuestId ?? null,
  };
}

function mapLedgerGuessToWineGuess(wineId: string, dto: CreditLedgerSource["guesses"][number]): WineGuess {
  return {
    wineId,
    country: dto.countryGuess,
    region: dto.regionGuess,
    appellation: dto.appellationGuess ?? "",
    grapeBlendMode: dto.grapeBlendMode ?? "",
    grapeBlend: dto.grapeBlendGuess,
    selectedGrapes: [],
    otherGrapesText: "",
    producer: dto.producerGuess,
    wineName: dto.wineCuveeGuess,
    vintage: dto.vintageGuess,
    rating: null,
    confidence: "medium",
  };
}

function betsFromDto(dto: CreditLedgerSource["guesses"][number]): FieldBets {
  return {
    country: dto.countryBet ?? 0,
    region: dto.regionBet ?? 0,
    appellation: dto.appellationBet ?? 0,
    grapeBlend: dto.grapeBlendBet ?? 0,
    vintage: dto.vintageBet ?? 0,
    producer: dto.producerBet ?? 0,
    wineName: dto.wineCuveeBet ?? 0,
  };
}

/**
 * Builds the ranked credits leaderboard from a get_credit_ledger_for_guest
 * (or the equivalently-shaped provisional/final leaderboard) response — see
 * CreditLedgerSource above. Only ever folds in already-revealed wines (the
 * response is pre-scoped to those) and only ever counts a guess once it's
 * locked — an abandoned/unlocked draft never settles, same convention
 * buildCourseRevealSubmissions already uses for accuracy scoring.
 */
export function buildCreditLedger(response: CreditLedgerSource): CreditLedgerView {
  const balances = new Map<string, number>();
  for (const g of response.guests) {
    balances.set(g.id, g.startingCredits ?? 0);
  }

  const lockedGuesses = response.guesses.filter((g) => g.lockedAt !== null);

  for (const wineDto of response.wines) {
    const wine = mapLedgerWineToAnswerKey(wineDto);
    const guessesForWine = lockedGuesses.filter((g) => g.wineId === wine.id);
    const settlement = settleBottleBets(
      wine,
      guessesForWine.map((g) => ({
        guestId: g.guestId,
        guestName: g.guestName,
        guess: mapLedgerGuessToWineGuess(wine.id, g),
        bets: betsFromDto(g),
      }))
    );

    for (const g of settlement.guessers) {
      balances.set(g.guestId, (balances.get(g.guestId) ?? 0) + g.netDelta);
    }
    if (settlement.contributorGuestId && settlement.contributorDelta !== null) {
      balances.set(
        settlement.contributorGuestId,
        (balances.get(settlement.contributorGuestId) ?? 0) + settlement.contributorDelta
      );
    }
  }

  const unranked = [...response.guests]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((g) => ({
      guestId: g.id,
      guestName: g.displayName,
      startingCredits: g.startingCredits ?? 0,
      currentBalance: balances.get(g.id) ?? 0,
    }));

  const ranks = rankByDescendingKeys(unranked, (e) => [e.currentBalance]);
  const entries: CreditLedgerEntry[] = unranked
    .map((entry, index) => ({ ...entry, rank: ranks[index] }))
    .sort((a, b) => a.rank - b.rank);

  return { entries };
}

/** This guest's own ledger entry, or undefined if they have no starting balance recorded (never fabricated). */
export function findMyLedgerEntry(entries: CreditLedgerEntry[], myGuestId: string): CreditLedgerEntry | undefined {
  return entries.find((e) => e.guestId === myGuestId);
}
