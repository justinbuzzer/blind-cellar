import { GrapeBlendMode, WineAnswerKey, WineGuess } from "@/types/tasting";
import { isCuveeBlindMatch, isNormalizedMatch, isProducerBlindMatch } from "./normalize";
import { scoreGrapeBlend } from "./scoring";
import { rankByDescendingKeys } from "./results";

/**
 * The betting sub-mode's settlement engine (see README "Tasting modes" —
 * "Betting"). Deliberately never duplicates any correctness-matching logic:
 * every field's exact-match check reuses the exact same primitives
 * (isNormalizedMatch/isProducerBlindMatch/isCuveeBlindMatch/scoreGrapeBlend's
 * `.correct`) the accuracy-scoring pipeline computes from — but, unlike
 * accuracy scoring, betting has no partial credit of its own: a field's odds
 * multiplier (see BetMultipliers below) is what tunes the risk/reward
 * instead. Like every other scoring computation in this app, nothing here is
 * ever persisted — a guest's credit balance is derived live from the raw
 * bet/guess rows on every load (see buildCreditLedger).
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

/**
 * One session's host-configured decimal odds per bettable field (see README
 * "Tasting modes" — "Betting") — payout on a win is `(multiplier - 1) *
 * bet`. Required (not partial) for a betting-enabled session: every field
 * always has a multiplier, set once at session creation and never editable
 * afterwards (balances are recomputed live on every load, so a
 * mid-tasting change would silently rewrite already-shown history).
 */
export type BetMultipliers = Record<BettableField, number>;

export interface FieldSettlement {
  field: BettableField;
  /** The amount actually wagered (never negative — see upsert_wine_guess's own validation). */
  bet: number;
  /** Whether this field's guess was an exact match — the sole determinant of win/loss under the odds-multiplier system (no partial credit in betting). */
  correct: boolean;
  /**
   * From the guesser's perspective: positive = won this amount from the
   * bottle's contributor, negative = lost this amount to them. Always 0 when
   * `bet` is 0, and always 0 for a field the answer key doesn't apply to
   * (Appellation on a wine with none recorded) — a non-applicable field is
   * never treated as a loss, since there was nothing to guess.
   */
  guesserDelta: number;
}

/**
 * Settlement formula (see README "Tasting modes" — "Betting"): an exact
 * match wins the guesser `round((multiplier - 1) * bet)` from the
 * contributor; anything short of exact — no partial credit here, unlike
 * accuracy scoring — costs the guesser the full bet. Never a smooth function
 * of closeness: exact match is a genuine win, everything else is a total
 * loss, and the multiplier is the only lever that shapes the payout.
 */
function settlementDeltaFor(applicable: boolean, correct: boolean, bet: number, multiplier: number): number {
  if (!applicable) return 0;
  const delta = correct ? Math.round((multiplier - 1) * bet) : -bet;
  return delta || 0; // normalizes -0 (e.g. a 0 bet's -bet) to a plain 0
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
  multiplier: number,
  guess: WineGuess,
  answer: Omit<WineAnswerKey, "contributorGuestId">
): FieldSettlement {
  const b = Math.max(0, bet);
  let applicable = true;
  let correct: boolean;

  switch (field) {
    case "country":
      correct = isNormalizedMatch(guess.country, answer.country);
      break;
    case "region":
      correct = isNormalizedMatch(guess.region, answer.region);
      break;
    case "appellation": {
      const actualAppellation = (answer.appellation ?? "").trim();
      applicable = actualAppellation.length > 0;
      correct = applicable ? isNormalizedMatch(guess.appellation, actualAppellation) : false;
      break;
    }
    case "grapeBlend":
      correct = scoreGrapeBlend(
        guess.grapeBlendMode,
        guess.grapeBlend,
        answer.grapeBlendMode,
        answer.grapeBlend
      ).correct;
      break;
    case "vintage":
      correct = isNormalizedMatch(guess.vintage, answer.vintage);
      break;
    case "producer":
      correct = isProducerBlindMatch(guess.producer, answer.producer);
      break;
    case "wineName":
      correct = isCuveeBlindMatch(guess.wineName, answer.wineName);
      break;
  }

  return {
    field,
    bet: b,
    correct,
    guesserDelta: settlementDeltaFor(applicable, correct, b, multiplier),
  };
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
  guessers: { guestId: string; guestName: string; guess: WineGuess; bets: FieldBets }[],
  multipliers: BetMultipliers
): BottleSettlement {
  const guesserSettlements: GuesserBetSettlement[] = guessers.map((g) => {
    const fields = BETTABLE_FIELDS.map((field) =>
      settleFieldBet(field, g.bets[field] ?? 0, multipliers[field], g.guess, wine)
    );
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
  /**
   * Session-scoped odds (see BetMultipliers above) — optional for the same
   * pre-betting-fixture reason as every other betting-only field here.
   * `null`/absent for a non-betting session, in which case buildCreditLedger
   * never calls the settlement engine at all (nothing to settle).
   */
  countryBetMultiplier?: number | null;
  regionBetMultiplier?: number | null;
  appellationBetMultiplier?: number | null;
  grapeBlendBetMultiplier?: number | null;
  vintageBetMultiplier?: number | null;
  producerBetMultiplier?: number | null;
  wineCuveeBetMultiplier?: number | null;
}

/** Null if any field's multiplier is missing — i.e. a non-betting session, where there is nothing to settle. */
function multipliersFromSource(response: CreditLedgerSource): BetMultipliers | null {
  const m: FieldBets = {
    country: response.countryBetMultiplier ?? undefined,
    region: response.regionBetMultiplier ?? undefined,
    appellation: response.appellationBetMultiplier ?? undefined,
    grapeBlend: response.grapeBlendBetMultiplier ?? undefined,
    vintage: response.vintageBetMultiplier ?? undefined,
    producer: response.producerBetMultiplier ?? undefined,
    wineName: response.wineCuveeBetMultiplier ?? undefined,
  };
  if (BETTABLE_FIELDS.some((field) => m[field] === undefined)) return null;
  return m as BetMultipliers;
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

  // Null only for a non-betting session (or a response missing its odds
  // config) — nothing to settle, every guest just sits at their starting
  // balance.
  const multipliers = multipliersFromSource(response);

  if (multipliers) {
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
        })),
        multipliers
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
