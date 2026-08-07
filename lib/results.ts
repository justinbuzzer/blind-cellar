import {
  BONUS_MAX_POINTS,
  CORE_MAX_POINTS,
  GuestSubmission,
  ScoredGuess,
  TastingReport,
  TastingSession,
  TasterOnWine,
  TasterResult,
  TOTAL_MAX_POINTS_PER_WINE,
  WineResult,
} from "@/types/tasting";
import { scoreWineGuess } from "./scoring";
import { round1 } from "./math";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Assigns standard competition rank from a descending multi-key sort (ties
 * share a rank; the next distinct rank skips accordingly). Keys are compared
 * in array order, most significant first. Exported for reuse by
 * lib/seenResults.ts, which needs the same tie-break-sharing rank shape for
 * its own (unrelated) rating-only bottle ranking.
 */
export function rankByDescendingKeys<T>(items: T[], keyFn: (item: T) => number[]): number[] {
  const ranks: number[] = new Array(items.length);
  const order = items
    .map((item, index) => ({ index, key: keyFn(item) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i += 1) {
        if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i];
      }
      return 0;
    });

  let currentRank = 0;
  let seen = 0;
  let previousKey: number[] | null = null;
  for (const { index, key } of order) {
    seen += 1;
    const isNewKey = !previousKey || key.some((k, i) => k !== previousKey![i]);
    if (isNewKey) {
      currentRank = seen;
      previousKey = key;
    }
    ranks[index] = currentRank;
  }
  return ranks;
}

/** Computes per-wine aggregate results (ratings + scored guesses) for every wine in the session. */
export function calculateWineResults(
  session: TastingSession,
  submissions: GuestSubmission[]
): WineResult[] {
  const lockedSubmissions = submissions.filter((s) => s.locked);

  return session.wines.map((wine) => {
    const scoredGuesses: ScoredGuess[] = [];
    const ratings: number[] = [];

    for (const submission of lockedSubmissions) {
      const guess = submission.guesses.find((g) => g.wineId === wine.id);
      if (!guess) continue;

      scoredGuesses.push(
        scoreWineGuess(submission.guestId, submission.guestName, guess, wine, session.scoringVersion)
      );
      if (guess.rating !== null) {
        ratings.push(guess.rating);
      }
    }

    const averageRating = average(ratings);
    const lowestRating = ratings.length ? Math.min(...ratings) : null;
    const highestRating = ratings.length ? Math.max(...ratings) : null;
    const ratingSpread =
      lowestRating !== null && highestRating !== null
        ? highestRating - lowestRating
        : null;

    const maxPoints = scoredGuesses.length
      ? Math.max(...scoredGuesses.map((g) => g.totalPoints))
      : null;
    const topTasters: TasterOnWine[] =
      maxPoints === null
        ? []
        : scoredGuesses
            .filter((g) => g.totalPoints === maxPoints)
            .map((g) => ({
              guestId: g.guestId,
              guestName: g.guestName,
              totalPoints: g.totalPoints,
              rating: g.rating,
            }));

    return {
      wine,
      averageRating: averageRating === null ? null : round1(averageRating),
      numRatings: ratings.length,
      lowestRating,
      highestRating,
      ratingSpread,
      guesses: scoredGuesses,
      topTasters,
      scoringVersion: session.scoringVersion,
    };
  });
}

/**
 * legacy_v1 ONLY — this math must never change: historic sessions depend on
 * it producing byte-for-byte identical leaderboards forever. Ranking is by
 * total points, then core points, then exact core-category matches; a full
 * tie across all three shares a rank (see `rankByDescendingKeys`). The
 * possible-points denominator is a fixed session-wide constant
 * (TOTAL_MAX_POINTS_PER_WINE * number of wines), exactly as this model has
 * always worked — a taster who skipped a bottle is not excluded from it.
 */
function calculateTasterResultsLegacyV1(
  session: TastingSession,
  submissions: GuestSubmission[]
): TasterResult[] {
  const lockedSubmissions = submissions.filter((s) => s.locked);
  const numWines = session.wines.length;
  const totalPossible = TOTAL_MAX_POINTS_PER_WINE * numWines;
  const corePossible = CORE_MAX_POINTS * numWines;
  const bonusPossible = BONUS_MAX_POINTS * numWines;

  const unranked = lockedSubmissions.map((submission) => {
    let corePoints = 0;
    let bonusPoints = 0;
    let totalPoints = 0;
    let exactCoreMatches = 0;
    let submittedGuessCount = 0;
    const ratings: number[] = [];

    for (const guess of submission.guesses) {
      const wine = session.wines.find((w) => w.id === guess.wineId);
      if (!wine) continue;
      const scored = scoreWineGuess(submission.guestId, submission.guestName, guess, wine, "legacy_v1");
      corePoints += scored.corePoints;
      bonusPoints += scored.bonusPoints;
      totalPoints += scored.totalPoints;
      exactCoreMatches += scored.fieldScores.filter(
        (f) => f.category === "core" && f.correct
      ).length;
      submittedGuessCount += 1;
      if (guess.rating !== null) ratings.push(guess.rating);
    }

    return {
      guestId: submission.guestId,
      guestName: submission.guestName,
      totalPoints,
      totalPossible,
      corePoints,
      corePossible,
      bonusPoints,
      bonusPossible,
      overallAccuracyPercent:
        totalPossible > 0 ? round1((totalPoints / totalPossible) * 100) : 0,
      coreAccuracyPercent:
        corePossible > 0 ? round1((corePoints / corePossible) * 100) : 0,
      exactCoreMatches,
      submittedGuessCount,
      averageRatingGiven:
        ratings.length === 0 ? null : round1(average(ratings) as number),
    };
  });

  const ranks = rankByDescendingKeys(unranked, (t) => [
    t.totalPoints,
    t.corePoints,
    t.exactCoreMatches,
  ]);

  return unranked
    .map((t, i) => ({ ...t, rank: ranks[i] }))
    .sort((a, b) => a.rank - b.rank);
}

/**
 * core_v3_appellation_conditional ONLY — because bottles can be scored out
 * of either 80 or 100 points (depending on whether the actual wine has an
 * Appellation), raw cumulative points are never a fair ranking basis here.
 * Instead: percentage accuracy = sum(earned) / sum(possible for the bottles
 * this taster actually submitted a guess for) * 100, primary key. Bottles
 * the taster never guessed on are excluded from both sums, so a taster who
 * only saw 80-point wines is compared fairly against one who only saw
 * 100-point wines. Ties break on: raw points earned, then number of
 * submitted guesses, then exact core-category matches (the same final
 * tie-break legacy_v1 uses).
 */
function calculateTasterResultsCoreV3(
  session: TastingSession,
  submissions: GuestSubmission[]
): TasterResult[] {
  const lockedSubmissions = submissions.filter((s) => s.locked);

  const unranked = lockedSubmissions.map((submission) => {
    let corePoints = 0;
    let totalPoints = 0;
    let corePossible = 0;
    let totalPossible = 0;
    let exactCoreMatches = 0;
    let submittedGuessCount = 0;
    const ratings: number[] = [];

    for (const guess of submission.guesses) {
      const wine = session.wines.find((w) => w.id === guess.wineId);
      if (!wine) continue;
      const scored = scoreWineGuess(
        submission.guestId,
        submission.guestName,
        guess,
        wine,
        "core_v3_appellation_conditional"
      );
      corePoints += scored.corePoints;
      totalPoints += scored.totalPoints;
      corePossible += scored.corePossiblePoints;
      totalPossible += scored.totalPossiblePoints;
      exactCoreMatches += scored.fieldScores.filter(
        (f) => f.category === "core" && f.correct && f.applicable !== false
      ).length;
      submittedGuessCount += 1;
      if (guess.rating !== null) ratings.push(guess.rating);
    }

    return {
      guestId: submission.guestId,
      guestName: submission.guestName,
      totalPoints,
      totalPossible,
      corePoints,
      corePossible,
      bonusPoints: 0,
      bonusPossible: 0,
      overallAccuracyPercent:
        totalPossible > 0 ? round1((totalPoints / totalPossible) * 100) : 0,
      coreAccuracyPercent:
        corePossible > 0 ? round1((corePoints / corePossible) * 100) : 0,
      exactCoreMatches,
      submittedGuessCount,
      averageRatingGiven:
        ratings.length === 0 ? null : round1(average(ratings) as number),
    };
  });

  const ranks = rankByDescendingKeys(unranked, (t) => [
    t.overallAccuracyPercent,
    t.totalPoints,
    t.submittedGuessCount,
    t.exactCoreMatches,
  ]);

  return unranked
    .map((t, i) => ({ ...t, rank: ranks[i] }))
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Computes the taster leaderboard for a session, dispatching to the version
 * whose math actually applies to it — see calculateTasterResultsLegacyV1 /
 * calculateTasterResultsCoreV3. Never used for Seen tastings, which have no
 * scoring or leaderboard at all (see lib/seenResults.ts).
 */
export function calculateTasterResults(
  session: TastingSession,
  submissions: GuestSubmission[]
): TasterResult[] {
  return session.scoringVersion === "core_v3_appellation_conditional"
    ? calculateTasterResultsCoreV3(session, submissions)
    : calculateTasterResultsLegacyV1(session, submissions);
}

/** Exported for reuse by lib/seenResults.ts's Wine of the Night / Most Divisive Wine equivalents. */
export function maxBy<T>(items: T[], keyFn: (item: T) => number | null): T[] {
  const withKeys = items
    .map((item) => ({ item, key: keyFn(item) }))
    .filter((x): x is { item: T; key: number } => x.key !== null);
  if (withKeys.length === 0) return [];
  const max = Math.max(...withKeys.map((x) => x.key));
  return withKeys.filter((x) => x.key === max).map((x) => x.item);
}

/** Exported for reuse by lib/seenResults.ts's Wine of the Night tie-break. */
export function minBy<T>(items: T[], keyFn: (item: T) => number | null): T[] {
  const withKeys = items
    .map((item) => ({ item, key: keyFn(item) }))
    .filter((x): x is { item: T; key: number } => x.key !== null);
  if (withKeys.length === 0) return [];
  const min = Math.min(...withKeys.map((x) => x.key));
  return withKeys.filter((x) => x.key === min).map((x) => x.item);
}

/** Wine(s) with the highest average rating; spread breaks ties; unresolved ties are returned as-is. */
export function calculateWineOfTheNight(wineResults: WineResult[]): WineResult[] {
  const topByAverage = maxBy(wineResults, (w) => w.averageRating);
  if (topByAverage.length <= 1) return topByAverage;
  return minBy(topByAverage, (w) => w.ratingSpread);
}

/** Guest(s) tied for rank 1 on the leaderboard (see calculateTasterResults for the version-dependent ranking key). */
export function calculateBestTaster(tasterResults: TasterResult[]): TasterResult[] {
  return tasterResults.filter((t) => t.rank === 1);
}

/** Wine(s) with the largest rating spread. */
export function calculateMostDivisiveWine(wineResults: WineResult[]): WineResult[] {
  return maxBy(wineResults, (w) => w.ratingSpread);
}

/** Builds the full post-reveal report from a session and its guest submissions. */
export function buildTastingReport(
  session: TastingSession,
  submissions: GuestSubmission[]
): TastingReport {
  const wineResults = calculateWineResults(session, submissions);
  const rankedWineResults = [...wineResults].sort((a, b) => {
    const aAvg = a.averageRating ?? -Infinity;
    const bAvg = b.averageRating ?? -Infinity;
    return bAvg - aAvg;
  });
  const tasterResults = calculateTasterResults(session, submissions);

  return {
    wineResults: rankedWineResults,
    tasterResults,
    wineOfTheNight: calculateWineOfTheNight(wineResults),
    bestTaster: calculateBestTaster(tasterResults),
    mostDivisiveWine: calculateMostDivisiveWine(wineResults),
    scoringVersion: session.scoringVersion,
  };
}
