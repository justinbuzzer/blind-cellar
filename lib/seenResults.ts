import {
  SeenBottleResult,
  SeenParticipantRating,
  SeenTastingReport,
  WineAnswerKey,
} from "@/types/tasting";
import { maxBy, minBy, rankByDescendingKeys } from "./results";
import { round1 } from "./math";

/**
 * A single participant's saved seen-tasting rating for one bottle. Deliberately
 * separate from WineGuess/RevealedWineGuessRow (the blind-guess shapes) —
 * seen mode never populates any identification field, so there's nothing to
 * carry here beyond the rating itself and the optional note.
 */
export interface SeenRatingRow {
  wineId: string;
  guestId: string;
  rating: number | null;
  note?: string;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Builds one SeenBottleResult per wine, listing every participant in the
 * session — including those with no saved rating (`rating: null`, never
 * fabricated as 0) — so the UI can render "No rating" explicitly. Ranking
 * (the `rank` field) follows the same tie-break order the report uses:
 * higher average rating, then lower spread, then more ratings submitted,
 * with a genuine tie sharing a rank (see `rankByDescendingKeys`).
 */
export function calculateSeenBottleResults(
  wines: WineAnswerKey[],
  guests: { id: string; displayName: string }[],
  ratingRows: SeenRatingRow[]
): SeenBottleResult[] {
  const unranked = wines.map((wine) => {
    const rowByGuestId = new Map(
      ratingRows.filter((r) => r.wineId === wine.id).map((r) => [r.guestId, r])
    );

    const participantRatings: SeenParticipantRating[] = guests.map((guest) => {
      const row = rowByGuestId.get(guest.id);
      return {
        guestId: guest.id,
        guestName: guest.displayName,
        rating: row?.rating ?? null,
        note: row?.note,
      };
    });

    const ratings = participantRatings
      .map((p) => p.rating)
      .filter((r): r is number => r !== null);

    const averageRating = average(ratings);
    const lowestRating = ratings.length ? Math.min(...ratings) : null;
    const highestRating = ratings.length ? Math.max(...ratings) : null;
    const ratingSpread =
      lowestRating !== null && highestRating !== null
        ? highestRating - lowestRating
        : null;

    return {
      wine,
      averageRating: averageRating === null ? null : round1(averageRating),
      numRatings: ratings.length,
      lowestRating,
      highestRating,
      ratingSpread,
      participantRatings,
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
export function orderSeenBottleResultsByRank(
  bottleResults: SeenBottleResult[]
): SeenBottleResult[] {
  return [...bottleResults].sort((a, b) => a.rank - b.rank);
}

/** Wine(s) with the highest average rating; spread breaks ties; unresolved ties are returned as-is. */
export function calculateSeenWineOfTheNight(
  bottleResults: SeenBottleResult[]
): SeenBottleResult[] {
  const topByAverage = maxBy(bottleResults, (b) => b.averageRating);
  if (topByAverage.length <= 1) return topByAverage;
  return minBy(topByAverage, (b) => b.ratingSpread);
}

/** Wine(s) with the largest rating spread. */
export function calculateSeenMostDivisiveWine(
  bottleResults: SeenBottleResult[]
): SeenBottleResult[] {
  return maxBy(bottleResults, (b) => b.ratingSpread);
}

/**
 * Builds the full seen-tasting report from every bottle's answer key, the
 * session's guest list, and every saved rating. No scoring, no Best Taster —
 * see the SeenTastingReport doc comment for why this is a wholly separate
 * type/pipeline from buildTastingReport in lib/results.ts.
 */
export function buildSeenTastingReport(
  wines: WineAnswerKey[],
  guests: { id: string; displayName: string }[],
  ratingRows: SeenRatingRow[]
): SeenTastingReport {
  const bottleResults = calculateSeenBottleResults(wines, guests, ratingRows);
  const raterIds = new Set(
    ratingRows.filter((r) => r.rating !== null).map((r) => r.guestId)
  );

  return {
    bottleResults: orderSeenBottleResultsByRank(bottleResults),
    wineOfTheNight: calculateSeenWineOfTheNight(bottleResults),
    mostDivisiveWine: calculateSeenMostDivisiveWine(bottleResults),
    totalRatings: ratingRows.filter((r) => r.rating !== null).length,
    totalRaters: raterIds.size,
    totalBottles: wines.length,
  };
}
