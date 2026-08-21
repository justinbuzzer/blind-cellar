import {
  MatchBottleResult,
  MatchParticipantPick,
  MatchTasterResult,
  MatchTastingReport,
  WineAnswerKey,
} from "@/types/tasting";
import { maxBy, minBy, rankByDescendingKeys } from "./results";
import { round1 } from "./math";

/**
 * A single participant's saved blind_match pick for one glass. Deliberately
 * separate from WineGuess/RevealedWineGuessRow (the field-by-field blind-guess
 * shapes) — this mode never populates any identification-guess field, only
 * matchedWineId/rating/note (see supabase/schema.sql's upsert_match_guess).
 */
export interface MatchGuessRow {
  wineId: string;
  guestId: string;
  matchedWineId: string | null;
  rating: number | null;
  note?: string;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Builds one MatchBottleResult per wine, listing every participant in the
 * session — including those with no saved pick (`pickedWine: null`,
 * `correct: null`, never fabricated as wrong). Correctness is a plain 1/0:
 * `pickedWine.id === wine.id`. Rating stats and bottle ranking mirror
 * calculateSeenBottleResults exactly (ratings are still a first-class part
 * of this mode); correctCount/totalPicks are new.
 */
export function calculateMatchBottleResults(
  wines: WineAnswerKey[],
  guests: { id: string; displayName: string }[],
  rows: MatchGuessRow[]
): MatchBottleResult[] {
  const wineById = new Map(wines.map((w) => [w.id, w]));

  const unranked = wines.map((wine) => {
    const rowByGuestId = new Map(rows.filter((r) => r.wineId === wine.id).map((r) => [r.guestId, r]));

    const participantPicks: MatchParticipantPick[] = guests.map((guest) => {
      const row = rowByGuestId.get(guest.id);
      const pickedWine = row?.matchedWineId ? wineById.get(row.matchedWineId) ?? null : null;
      return {
        guestId: guest.id,
        guestName: guest.displayName,
        pickedWine,
        correct: pickedWine ? pickedWine.id === wine.id : null,
        rating: row?.rating ?? null,
        note: row?.note,
      };
    });

    const ratings = participantPicks.map((p) => p.rating).filter((r): r is number => r !== null);
    const averageRating = average(ratings);
    const lowestRating = ratings.length ? Math.min(...ratings) : null;
    const highestRating = ratings.length ? Math.max(...ratings) : null;
    const ratingSpread =
      lowestRating !== null && highestRating !== null ? highestRating - lowestRating : null;

    return {
      wine,
      averageRating: averageRating === null ? null : round1(averageRating),
      numRatings: ratings.length,
      lowestRating,
      highestRating,
      ratingSpread,
      correctCount: participantPicks.filter((p) => p.correct === true).length,
      totalPicks: participantPicks.filter((p) => p.pickedWine !== null).length,
      participantPicks,
    };
  });

  const ranks = rankByDescendingKeys(unranked, (b) => [
    b.averageRating ?? -Infinity,
    b.ratingSpread === null ? -Infinity : -b.ratingSpread,
    b.numRatings,
  ]);

  return unranked.map((result, i) => ({ ...result, rank: ranks[i] }));
}

/** Bottles ordered best-first by rank (ties keep their relative wine order). */
export function orderMatchBottleResultsByRank(bottleResults: MatchBottleResult[]): MatchBottleResult[] {
  return [...bottleResults].sort((a, b) => a.rank - b.rank);
}

/**
 * One entry per guest, ranked by how many glasses they correctly matched —
 * the leaderboard Seen mode has no equivalent of, since Seen has no
 * correctness at all. Ties broken alphabetically by name (pre-sorting
 * before ranking and relying on Array.sort's stability), matching the
 * convention lib/resultsReveal.ts's buildRankedResults already uses.
 */
export function calculateMatchTasterResults(
  wines: WineAnswerKey[],
  guests: { id: string; displayName: string }[],
  rows: MatchGuessRow[]
): MatchTasterResult[] {
  const wineIds = new Set(wines.map((w) => w.id));
  const alphabetical = [...guests].sort((a, b) => a.displayName.localeCompare(b.displayName));

  const unranked = alphabetical.map((guest) => {
    const correctCount = rows.filter(
      (r) => r.guestId === guest.id && wineIds.has(r.wineId) && r.matchedWineId === r.wineId
    ).length;
    const totalBottles = wines.length;
    return {
      guestId: guest.id,
      guestName: guest.displayName,
      correctCount,
      totalBottles,
      accuracyPercent: totalBottles === 0 ? 0 : round1((correctCount / totalBottles) * 100),
    };
  });

  const ranks = rankByDescendingKeys(unranked, (t) => [t.correctCount]);
  return unranked.map((result, i) => ({ ...result, rank: ranks[i] }));
}

/** Wine(s) with the highest average rating; spread breaks ties; unresolved ties are returned as-is. */
export function calculateMatchWineOfTheNight(bottleResults: MatchBottleResult[]): MatchBottleResult[] {
  const topByAverage = maxBy(bottleResults, (b) => b.averageRating);
  if (topByAverage.length <= 1) return topByAverage;
  return minBy(topByAverage, (b) => b.ratingSpread);
}

/** Wine(s) with the largest rating spread. */
export function calculateMatchMostDivisiveWine(bottleResults: MatchBottleResult[]): MatchBottleResult[] {
  return maxBy(bottleResults, (b) => b.ratingSpread);
}

/**
 * Builds the full blind_match report from every bottle's answer key, the
 * session's guest list, and every saved pick/rating. See
 * MatchTastingReport's doc comment for why this is a wholly separate
 * type/pipeline from both buildTastingReport (field-scoring) and
 * buildSeenTastingReport (no correctness at all).
 */
export function buildMatchTastingReport(
  wines: WineAnswerKey[],
  guests: { id: string; displayName: string }[],
  rows: MatchGuessRow[]
): MatchTastingReport {
  const bottleResults = calculateMatchBottleResults(wines, guests, rows);
  const raterIds = new Set(rows.filter((r) => r.rating !== null).map((r) => r.guestId));

  return {
    bottleResults: orderMatchBottleResultsByRank(bottleResults),
    tasterResults: calculateMatchTasterResults(wines, guests, rows),
    wineOfTheNight: calculateMatchWineOfTheNight(bottleResults),
    mostDivisiveWine: calculateMatchMostDivisiveWine(bottleResults),
    totalRatings: rows.filter((r) => r.rating !== null).length,
    totalRaters: raterIds.size,
    totalBottles: wines.length,
    totalParticipants: guests.length,
  };
}
