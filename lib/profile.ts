import {
  BonusScorableField,
  CORE_MAX_POINTS,
  CoreScorableField,
  ScorableField,
  ScoredGuess,
  TASTING_MODES,
  TastingMode,
  TOTAL_MAX_POINTS_PER_WINE,
  WINE_STYLE_LABELS,
  WINE_STYLES,
  WineAnswerKey,
  WineStyle,
} from "@/types/tasting";
import { ReportData } from "@/lib/supabase/reportData";
import { AccountTastingRecordRow } from "@/lib/supabase/types";
import { normalizeText } from "./normalize";
import { round1 } from "./math";

// ---------------------------------------------------------------------------
// The Palate Profile (see README "Palate Profile") is built entirely from the
// signed-in user's own account_tasting_records (RLS-scoped to auth.uid()) —
// never browser-only unclaimed archive records, never another user's data.
// Everything here is pure and dependency-injected, same philosophy as
// lib/archive.ts and lib/results.ts: the privacy/aggregation-sensitive
// classification logic is unit-testable with fakes, and all scoring is
// delegated to the existing engine (buildTastingReport/buildSeenTastingReport
// via ReportData, and scoreWineGuess indirectly through it) — nothing here
// recomputes a score.
// ---------------------------------------------------------------------------

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Tasting scope — see README "Core scope rule: Seen tasting filter".
// ---------------------------------------------------------------------------

export type TastingScope = "blind_only" | "include_seen";
export const DEFAULT_TASTING_SCOPE: TastingScope = "blind_only";

const SCOPE_MODES: Record<TastingScope, TastingMode[]> = {
  blind_only: ["full_blind", "course_reveal"],
  include_seen: ["full_blind", "course_reveal", "seen"],
};

export function isValidTastingScope(value: unknown): value is TastingScope {
  return value === "blind_only" || value === "include_seen";
}

export function modesForScope(scope: TastingScope): TastingMode[] {
  return SCOPE_MODES[scope];
}

// ---------------------------------------------------------------------------
// Session-link resolution and deduplication (see README "Palate Profile" —
// "Duplicate handling"). A signed-in host who also participated in their own
// tasting must count once, and their ratings/guesses must come from their
// actual guest row, never fabricated from the host link alone.
// ---------------------------------------------------------------------------

export type CombinedRole = "host" | "participant" | "host_and_participant";

export interface SessionLink {
  sessionId: string;
  role: CombinedRole;
  /**
   * The guest row to use for this user's ratings/guesses in this session —
   * the linked participant record when one exists, otherwise the session's
   * host_guest_id when only a host link exists. Null only if neither is
   * resolvable (defensive; every session has a host_guest_id once created).
   */
  engagementGuestId: string | null;
}

/**
 * One row per (session_id, host|participant) — at most one host row and,
 * in the ordinary case, at most one participant row per user per session,
 * though a user who joined the same session twice under different display
 * names could hold two participant rows for it (see README). Records are
 * sorted by claimed_at first so that edge case resolves deterministically
 * (earliest-claimed participant identity wins).
 */
export function resolveSessionLinks(
  records: AccountTastingRecordRow[],
  hostGuestIdBySession: Map<string, string | null>
): SessionLink[] {
  const sorted = [...records].sort((a, b) =>
    a.claimed_at < b.claimed_at ? -1 : a.claimed_at > b.claimed_at ? 1 : 0
  );

  const bySession = new Map<string, { hasHost: boolean; participantIds: string[] }>();
  for (const r of sorted) {
    const entry = bySession.get(r.session_id) ?? { hasHost: false, participantIds: [] };
    if (r.role === "host") {
      entry.hasHost = true;
    } else if (r.participant_id) {
      entry.participantIds.push(r.participant_id);
    }
    bySession.set(r.session_id, entry);
  }

  const links: SessionLink[] = [];
  for (const [sessionId, entry] of Array.from(bySession.entries())) {
    const role: CombinedRole =
      entry.hasHost && entry.participantIds.length > 0
        ? "host_and_participant"
        : entry.hasHost
          ? "host"
          : "participant";

    const engagementGuestId =
      entry.participantIds[0] ?? (entry.hasHost ? (hostGuestIdBySession.get(sessionId) ?? null) : null);

    links.push({ sessionId, role, engagementGuestId });
  }
  return links;
}

// ---------------------------------------------------------------------------
// Session metadata + wine observations
// ---------------------------------------------------------------------------

export interface SessionMeta {
  sessionId: string;
  publicId: string;
  title: string;
  /** Tasting date if available, otherwise session creation date — already resolved by the caller. */
  tastingDate: string;
  createdAt: string;
  tastingMode: TastingMode;
  bottleCount: number;
  participantCount: number;
}

/**
 * One (session, bottle) observation this user actually engaged with — a
 * submitted rating and/or a submitted, locked blind guess. Never fabricated
 * for a bottle the user merely had access to (see README "Bottles tasted").
 */
export interface WineObservation {
  sessionId: string;
  publicId: string;
  sessionTitle: string;
  tastingDate: string;
  sessionCreatedAt: string;
  tastingMode: TastingMode;
  role: CombinedRole;
  wine: WineAnswerKey;
  identityKey: string;
  personalRating: number | null;
  groupAverageRating: number | null;
  groupNumRatings: number;
  /** Non-null only for full_blind/course_reveal, when this user submitted a guess for this wine. */
  scoredGuess: ScoredGuess | null;
  contributedByYou: boolean;
}

/**
 * Best-effort wine identity for aggregation only (see README "Palate
 * Profile" — "Best-effort wine matching based on recorded wine details").
 * Concatenates every field after normalization, so two wines only ever
 * collapse into one identity when producer, wine/cuvée, vintage, region, AND
 * country all match — never on a partial/vague match. Original display
 * values are always preserved separately on the observation itself.
 */
export function normalizeWineIdentityKey(wine: {
  producer: string;
  wineName: string;
  vintage: string;
  region: string;
  country: string;
}): string {
  return [wine.producer, wine.wineName, wine.vintage, wine.region, wine.country]
    .map((part) => normalizeText(part))
    .join("|");
}

/**
 * Builds this user's wine observations for one already-revealed, already
 * scope-eligible session, reusing the exact report the final-report page
 * itself would show (see lib/supabase/reportData.ts) — no scoring is
 * recomputed here. `engagementGuestId` must be the exact guest row resolved
 * by resolveSessionLinks; a bottle only becomes an observation if that guest
 * actually has a submitted/locked entry for it.
 */
export function buildWineObservationsForSession(
  meta: SessionMeta,
  reportData: ReportData,
  engagementGuestId: string,
  role: CombinedRole
): WineObservation[] {
  const observations: WineObservation[] = [];

  if (reportData.kind === "seen") {
    for (const bottle of reportData.report.bottleResults) {
      const mine = bottle.participantRatings.find((p) => p.guestId === engagementGuestId);
      if (!mine || mine.rating === null) continue;
      observations.push({
        sessionId: meta.sessionId,
        publicId: meta.publicId,
        sessionTitle: meta.title,
        tastingDate: meta.tastingDate,
        sessionCreatedAt: meta.createdAt,
        tastingMode: meta.tastingMode,
        role,
        wine: bottle.wine,
        identityKey: normalizeWineIdentityKey(bottle.wine),
        personalRating: mine.rating,
        groupAverageRating: bottle.averageRating,
        groupNumRatings: bottle.numRatings,
        scoredGuess: null,
        contributedByYou: bottle.wine.contributorGuestId === engagementGuestId,
      });
    }
    return observations;
  }

  for (const wineResult of reportData.report.wineResults) {
    const mine = wineResult.guesses.find((g) => g.guestId === engagementGuestId);
    if (!mine) continue;
    observations.push({
      sessionId: meta.sessionId,
      publicId: meta.publicId,
      sessionTitle: meta.title,
      tastingDate: meta.tastingDate,
      sessionCreatedAt: meta.createdAt,
      tastingMode: meta.tastingMode,
      role,
      wine: wineResult.wine,
      identityKey: normalizeWineIdentityKey(wineResult.wine),
      personalRating: mine.rating,
      groupAverageRating: wineResult.averageRating,
      groupNumRatings: wineResult.numRatings,
      scoredGuess: mine,
      contributedByYou: wineResult.wine.contributorGuestId === engagementGuestId,
    });
  }
  return observations;
}

// ---------------------------------------------------------------------------
// 1. At a glance
// ---------------------------------------------------------------------------

export interface AtAGlance {
  tastingsAttended: number;
  bottlesTasted: number;
  uniqueWinesTasted: number;
  ratingsSubmitted: number;
  averagePersonalRating: number | null;
  firstTastingDate: string | null;
  latestTastingDate: string | null;
}

/** `scopedMetas` must already be deduplicated to one entry per session (see resolveSessionLinks) and filtered to the current scope's modes. */
export function computeAtAGlance(scopedMetas: SessionMeta[], scopedObservations: WineObservation[]): AtAGlance {
  const uniqueWinesTasted = new Set(scopedObservations.map((o) => o.identityKey)).size;
  const ratings = scopedObservations.map((o) => o.personalRating).filter((r): r is number => r !== null);
  const dates = scopedMetas.map((m) => m.tastingDate).sort();

  return {
    tastingsAttended: scopedMetas.length,
    bottlesTasted: scopedObservations.length,
    uniqueWinesTasted,
    ratingsSubmitted: ratings.length,
    averagePersonalRating: ratings.length ? round1(average(ratings)) : null,
    firstTastingDate: dates[0] ?? null,
    latestTastingDate: dates[dates.length - 1] ?? null,
  };
}

// ---------------------------------------------------------------------------
// 2. Blind palate — always Full blind + Course-by-course only, regardless of
// the Seen scope toggle (see README "Core scope rule: Seen tasting filter").
// ---------------------------------------------------------------------------

const CORE_FIELDS: { field: CoreScorableField; label: string }[] = [
  { field: "country", label: "Country" },
  { field: "region", label: "Region" },
  { field: "grapeBlend", label: "Grape / blend" },
  { field: "vintage", label: "Vintage" },
];
const BONUS_FIELDS: { field: BonusScorableField; label: string }[] = [
  { field: "producer", label: "Producer" },
  { field: "wineName", label: "Wine / cuvée" },
];

const MIN_BLIND_SAMPLE_OVERALL = 10;
const MIN_CATEGORY_SAMPLE = 5;

export interface CategoryAccuracy {
  field: ScorableField;
  label: string;
  correct: number;
  submitted: number;
  accuracyPercent: number | null;
}

export interface BlindPalateStrengths {
  strongestCore: CategoryAccuracy | null;
  developingCore: CategoryAccuracy | null;
  bestBonus: CategoryAccuracy | null;
  hasSufficientSample: boolean;
}

export interface BlindPalate {
  totalSubmittedCalls: number;
  coreAccuracyPercent: number | null;
  overallAccuracyPercent: number | null;
  corePointsEarned: number;
  corePointsPossible: number;
  totalPointsEarned: number;
  totalPointsPossible: number;
  coreCategories: CategoryAccuracy[];
  bonusCategories: CategoryAccuracy[];
  strengths: BlindPalateStrengths;
}

function categoryAccuracy(guesses: ScoredGuess[], field: ScorableField, label: string): CategoryAccuracy {
  const submitted = guesses.length;
  const correct = guesses.filter((g) => g.fieldScores.find((f) => f.field === field)?.correct).length;
  return {
    field,
    label,
    correct,
    submitted,
    accuracyPercent: submitted > 0 ? round1((correct / submitted) * 100) : null,
  };
}

/** `blindObservations` must already be restricted to full_blind/course_reveal sessions with a submitted guess — see extractBlindObservations. */
export function computeBlindPalate(blindObservations: WineObservation[]): BlindPalate {
  const guesses = blindObservations.map((o) => o.scoredGuess).filter((g): g is ScoredGuess => g !== null);

  const totalSubmittedCalls = guesses.length;
  const corePointsEarned = guesses.reduce((sum, g) => sum + g.corePoints, 0);
  const totalPointsEarned = guesses.reduce((sum, g) => sum + g.totalPoints, 0);
  const corePointsPossible = CORE_MAX_POINTS * totalSubmittedCalls;
  const totalPointsPossible = TOTAL_MAX_POINTS_PER_WINE * totalSubmittedCalls;

  const coreCategories = CORE_FIELDS.map(({ field, label }) => categoryAccuracy(guesses, field, label));
  const bonusCategories = BONUS_FIELDS.map(({ field, label }) => categoryAccuracy(guesses, field, label));

  const eligibleCore = coreCategories.filter((c) => c.submitted >= MIN_CATEGORY_SAMPLE);
  const eligibleBonus = bonusCategories.filter((c) => c.submitted >= MIN_CATEGORY_SAMPLE);
  const hasSufficientSample = totalSubmittedCalls >= MIN_BLIND_SAMPLE_OVERALL && eligibleCore.length > 0;

  let strongestCore: CategoryAccuracy | null = null;
  let developingCore: CategoryAccuracy | null = null;
  let bestBonus: CategoryAccuracy | null = null;
  if (hasSufficientSample) {
    strongestCore = eligibleCore.reduce((best, c) =>
      (c.accuracyPercent ?? -1) > (best.accuracyPercent ?? -1) ? c : best
    );
    developingCore = eligibleCore.reduce((worst, c) =>
      (c.accuracyPercent ?? 101) < (worst.accuracyPercent ?? 101) ? c : worst
    );
    if (eligibleBonus.length > 0) {
      bestBonus = eligibleBonus.reduce((best, c) => ((c.accuracyPercent ?? -1) > (best.accuracyPercent ?? -1) ? c : best));
    }
  }

  return {
    totalSubmittedCalls,
    coreAccuracyPercent: corePointsPossible > 0 ? round1((corePointsEarned / corePointsPossible) * 100) : null,
    overallAccuracyPercent: totalPointsPossible > 0 ? round1((totalPointsEarned / totalPointsPossible) * 100) : null,
    corePointsEarned,
    corePointsPossible,
    totalPointsEarned,
    totalPointsPossible,
    coreCategories,
    bonusCategories,
    strengths: { strongestCore, developingCore, bestBonus, hasSufficientSample },
  };
}

/** Blind palate is always Full blind + Course-by-course with a submitted guess, independent of the Seen scope toggle — filter the user's full observation set with this before calling computeBlindPalate. */
export function extractBlindObservations(allObservations: WineObservation[]): WineObservation[] {
  return allObservations.filter((o) => o.tastingMode !== "seen" && o.scoredGuess !== null);
}

// ---------------------------------------------------------------------------
// 3. Your wine record — scope-sensitive preference summaries.
// ---------------------------------------------------------------------------

export interface RankedCount {
  label: string;
  count: number;
}

export interface RankedRating {
  label: string;
  averageRating: number;
  count: number;
}

export interface StandoutBottle {
  publicId: string;
  wine: WineAnswerKey;
  personalRating: number;
  tastingDate: string;
}

export interface RevisitedWine {
  identityKey: string;
  wine: WineAnswerKey;
  occasions: number;
  firstTastedDate: string;
  lastTastedDate: string;
  minRating: number | null;
  maxRating: number | null;
  averageRating: number | null;
}

export interface WineRecord {
  mostExploredCountries: RankedCount[];
  mostExploredRegions: RankedCount[];
  mostExploredGrapes: RankedCount[];
  mostExploredStyles: RankedCount[];
  highestRatedCountries: RankedRating[];
  highestRatedRegions: RankedRating[];
  highestRatedGrapes: RankedRating[];
  highestRatedStyles: RankedRating[];
  familiarProducers: RankedCount[];
  familiarWines: RankedCount[];
  standoutBottles: StandoutBottle[];
  mostRevisited: RevisitedWine[];
}

const EXPLORED_LIMIT = 5;
const HIGHEST_RATED_LIMIT = 5;
const HIGHEST_RATED_MIN_COUNT = 3;
const FAMILIAR_LIMIT = 5;
const FAMILIAR_MIN_COUNT = 2;
const STANDOUT_LIMIT = 5;
const STANDOUT_HARD_CAP = 10;
const MOST_REVISITED_MIN_OCCASIONS = 2;

function topCounts(
  observations: WineObservation[],
  keyFn: (o: WineObservation) => string | null,
  { limit = EXPLORED_LIMIT, minCount = 1 }: { limit?: number; minCount?: number } = {}
): RankedCount[] {
  const counts = new Map<string, number>();
  for (const o of observations) {
    const key = keyFn(o);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= minCount)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function topRated(
  observations: WineObservation[],
  keyFn: (o: WineObservation) => string | null,
  { limit = HIGHEST_RATED_LIMIT, minCount = HIGHEST_RATED_MIN_COUNT }: { limit?: number; minCount?: number } = {}
): RankedRating[] {
  const byKey = new Map<string, number[]>();
  for (const o of observations) {
    if (o.personalRating === null) continue;
    const key = keyFn(o);
    if (!key) continue;
    const ratings = byKey.get(key) ?? [];
    ratings.push(o.personalRating);
    byKey.set(key, ratings);
  }
  return Array.from(byKey.entries())
    .filter(([, ratings]) => ratings.length >= minCount)
    .map(([label, ratings]) => ({ label, averageRating: round1(average(ratings)), count: ratings.length }))
    .sort((a, b) => b.averageRating - a.averageRating || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function styleLabel(o: WineObservation): string | null {
  return WINE_STYLE_LABELS[o.wine.wineStyle] ?? null;
}

export function computeWineRecord(observations: WineObservation[]): WineRecord {
  const mostExploredCountries = topCounts(observations, (o) => o.wine.country || null);
  const mostExploredRegions = topCounts(observations, (o) => o.wine.region || null);
  const mostExploredGrapes = topCounts(observations, (o) => o.wine.grapeBlend || null);
  const mostExploredStyles = topCounts(observations, styleLabel);

  const highestRatedCountries = topRated(observations, (o) => o.wine.country || null);
  const highestRatedRegions = topRated(observations, (o) => o.wine.region || null);
  const highestRatedGrapes = topRated(observations, (o) => o.wine.grapeBlend || null);
  const highestRatedStyles = topRated(observations, styleLabel);

  const familiarProducers = topCounts(observations, (o) => o.wine.producer || null, {
    limit: FAMILIAR_LIMIT,
    minCount: FAMILIAR_MIN_COUNT,
  });
  const familiarWines = topCounts(observations, (o) => o.wine.wineName || null, {
    limit: FAMILIAR_LIMIT,
    minCount: FAMILIAR_MIN_COUNT,
  });

  const rated = observations.filter(
    (o): o is WineObservation & { personalRating: number } => o.personalRating !== null
  );
  const sortedByRating = [...rated].sort((a, b) => b.personalRating - a.personalRating);
  const cutoffRating = sortedByRating[STANDOUT_LIMIT - 1]?.personalRating;
  const standoutBottles: StandoutBottle[] = (
    cutoffRating === undefined ? sortedByRating : sortedByRating.filter((o) => o.personalRating >= cutoffRating)
  )
    .slice(0, STANDOUT_HARD_CAP)
    .map((o) => ({
      publicId: o.publicId,
      wine: o.wine,
      personalRating: o.personalRating,
      tastingDate: o.tastingDate,
    }));

  const byIdentity = new Map<string, WineObservation[]>();
  for (const o of observations) {
    const list = byIdentity.get(o.identityKey) ?? [];
    list.push(o);
    byIdentity.set(o.identityKey, list);
  }
  const mostRevisited: RevisitedWine[] = Array.from(byIdentity.values())
    .map((obs): RevisitedWine => {
      const distinctSessions = new Set(obs.map((o) => o.sessionId));
      const dates = [...obs].map((o) => o.tastingDate).sort();
      const ratings = obs.map((o) => o.personalRating).filter((r): r is number => r !== null);
      return {
        identityKey: obs[0].identityKey,
        wine: obs[0].wine,
        occasions: distinctSessions.size,
        firstTastedDate: dates[0],
        lastTastedDate: dates[dates.length - 1],
        minRating: ratings.length ? Math.min(...ratings) : null,
        maxRating: ratings.length ? Math.max(...ratings) : null,
        averageRating: ratings.length ? round1(average(ratings)) : null,
      };
    })
    .filter((w) => w.occasions >= MOST_REVISITED_MIN_OCCASIONS)
    .sort((a, b) => b.occasions - a.occasions || a.wine.producer.localeCompare(b.wine.producer));

  return {
    mostExploredCountries,
    mostExploredRegions,
    mostExploredGrapes,
    mostExploredStyles,
    highestRatedCountries,
    highestRatedRegions,
    highestRatedGrapes,
    highestRatedStyles,
    familiarProducers,
    familiarWines,
    standoutBottles,
    mostRevisited,
  };
}

// ---------------------------------------------------------------------------
// 5. Recent evenings
// ---------------------------------------------------------------------------

export interface RecentEvening {
  publicId: string;
  title: string;
  tastingDate: string;
  tastingMode: TastingMode;
  bottleCount: number;
  role: CombinedRole;
}

const RECENT_EVENINGS_LIMIT = 5;

/** `scopedMetas` must already be deduplicated to one entry per session and filtered to the current scope's modes. */
export function computeRecentEvenings(
  scopedMetas: SessionMeta[],
  roleBySessionId: Map<string, CombinedRole>
): RecentEvening[] {
  return [...scopedMetas]
    .sort((a, b) => {
      if (a.tastingDate !== b.tastingDate) return a.tastingDate < b.tastingDate ? 1 : -1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return 0;
    })
    .slice(0, RECENT_EVENINGS_LIMIT)
    .map((m) => ({
      publicId: m.publicId,
      title: m.title,
      tastingDate: m.tastingDate,
      tastingMode: m.tastingMode,
      bottleCount: m.bottleCount,
      role: roleBySessionId.get(m.sessionId) ?? "participant",
    }));
}

// ---------------------------------------------------------------------------
// 4. Tasted wines ledger
// ---------------------------------------------------------------------------

export interface LedgerRow {
  publicId: string;
  sessionTitle: string;
  tastingDate: string;
  tastingMode: TastingMode;
  role: CombinedRole;
  producer: string;
  wineName: string;
  vintage: string;
  region: string;
  country: string;
  wineStyle: WineStyle;
  grapeBlend: string;
  personalRating: number | null;
  groupAverageRating: number | null;
  groupNumRatings: number;
  contributedByYou: boolean;
  identityKey: string;
  revisitCount: number;
}

/** `observations` must already be filtered to the current scope. Revisit counts are computed within this same scoped set, so they change with scope, same as every other Your wine record figure. */
export function buildLedgerRows(observations: WineObservation[]): LedgerRow[] {
  const sessionsByIdentity = new Map<string, Set<string>>();
  for (const o of observations) {
    const set = sessionsByIdentity.get(o.identityKey) ?? new Set<string>();
    set.add(o.sessionId);
    sessionsByIdentity.set(o.identityKey, set);
  }

  return observations.map((o) => ({
    publicId: o.publicId,
    sessionTitle: o.sessionTitle,
    tastingDate: o.tastingDate,
    tastingMode: o.tastingMode,
    role: o.role,
    producer: o.wine.producer,
    wineName: o.wine.wineName,
    vintage: o.wine.vintage,
    region: o.wine.region,
    country: o.wine.country,
    wineStyle: o.wine.wineStyle,
    grapeBlend: o.wine.grapeBlend,
    personalRating: o.personalRating,
    groupAverageRating: o.groupAverageRating,
    groupNumRatings: o.groupNumRatings,
    contributedByYou: o.contributedByYou,
    identityKey: o.identityKey,
    revisitCount: sessionsByIdentity.get(o.identityKey)?.size ?? 1,
  }));
}

export interface LedgerFilters {
  search: string;
  wineStyle: WineStyle | "all";
  country: string | "all";
  tastingMode: TastingMode | "all";
  yearTasted: string | "all";
  minRating: number | "all";
  contributedByYou: boolean;
}

export const DEFAULT_LEDGER_FILTERS: LedgerFilters = {
  search: "",
  wineStyle: "all",
  country: "all",
  tastingMode: "all",
  yearTasted: "all",
  minRating: "all",
  contributedByYou: false,
};

function tastingYear(dateString: string): string {
  return dateString.slice(0, 4);
}

function rowMatchesSearch(row: LedgerRow, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const haystack = [row.producer, row.wineName, row.region, row.country, row.grapeBlend, row.sessionTitle]
    .map(normalizeText)
    .join(" ");
  return haystack.includes(q);
}

export function filterLedgerRows(rows: LedgerRow[], filters: LedgerFilters): LedgerRow[] {
  return rows.filter((row) => {
    if (!rowMatchesSearch(row, filters.search)) return false;
    if (filters.wineStyle !== "all" && row.wineStyle !== filters.wineStyle) return false;
    if (filters.country !== "all" && row.country !== filters.country) return false;
    if (filters.tastingMode !== "all" && row.tastingMode !== filters.tastingMode) return false;
    if (filters.yearTasted !== "all" && tastingYear(row.tastingDate) !== filters.yearTasted) return false;
    if (filters.minRating !== "all" && (row.personalRating === null || row.personalRating < filters.minRating)) {
      return false;
    }
    if (filters.contributedByYou && !row.contributedByYou) return false;
    return true;
  });
}

export type LedgerSort = "recent" | "rating_desc" | "rating_asc" | "wine_name" | "country" | "most_revisited";
export const DEFAULT_LEDGER_SORT: LedgerSort = "recent";
const LEDGER_SORTS: LedgerSort[] = ["recent", "rating_desc", "rating_asc", "wine_name", "country", "most_revisited"];

export function isValidLedgerSort(value: unknown): value is LedgerSort {
  return typeof value === "string" && (LEDGER_SORTS as string[]).includes(value);
}

export function sortLedgerRows(rows: LedgerRow[], sort: LedgerSort): LedgerRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "rating_desc":
      return sorted.sort((a, b) => (b.personalRating ?? -1) - (a.personalRating ?? -1));
    case "rating_asc":
      return sorted.sort((a, b) => (a.personalRating ?? 101) - (b.personalRating ?? 101));
    case "wine_name":
      return sorted.sort((a, b) => a.wineName.localeCompare(b.wineName));
    case "country":
      return sorted.sort((a, b) => a.country.localeCompare(b.country));
    case "most_revisited":
      return sorted.sort((a, b) => b.revisitCount - a.revisitCount || (a.tastingDate < b.tastingDate ? 1 : -1));
    case "recent":
    default:
      return sorted.sort((a, b) => (a.tastingDate < b.tastingDate ? 1 : a.tastingDate > b.tastingDate ? -1 : 0));
  }
}

export const LEDGER_PAGE_SIZE = 20;
const MAX_LEDGER_PAGE_SIZE = 50;

export interface LedgerPage {
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginateLedgerRows(rows: LedgerRow[], page: number, pageSize: number = LEDGER_PAGE_SIZE): LedgerPage {
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize) || LEDGER_PAGE_SIZE), MAX_LEDGER_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * safePageSize;
  return {
    rows: rows.slice(start, start + safePageSize),
    total: rows.length,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

export interface LedgerFilterOptions {
  wineStyles: WineStyle[];
  countries: string[];
  tastingModes: TastingMode[];
  years: string[];
  hasContributedByYou: boolean;
}

/** Filter option lists are always derived from this user's own already-scoped rows — never a global vocabulary — so a filter can never reveal that a value exists elsewhere in the system. */
export function deriveLedgerFilterOptions(rows: LedgerRow[]): LedgerFilterOptions {
  return {
    wineStyles: Array.from(new Set(rows.map((r) => r.wineStyle))).sort(),
    countries: Array.from(new Set(rows.map((r) => r.country))).sort((a, b) => a.localeCompare(b)),
    tastingModes: Array.from(new Set(rows.map((r) => r.tastingMode))),
    years: Array.from(new Set(rows.map((r) => tastingYear(r.tastingDate)))).sort((a, b) => b.localeCompare(a)),
    hasContributedByYou: rows.some((r) => r.contributedByYou),
  };
}

export interface ParsedLedgerQuery {
  scope: TastingScope;
  filters: LedgerFilters;
  sort: LedgerSort;
  page: number;
}

const MAX_SEARCH_LENGTH = 200;
const MAX_COUNTRY_LENGTH = 100;
const MIN_RATING_BOUND = 50;
const MAX_RATING_BOUND = 100;

/** Validates and bounds every ledger query parameter server-side — an invalid/out-of-range value always falls back to a safe default rather than erroring, matching this app's existing parse-request conventions (see lib/archive.ts's parseClaimRequest). */
export function parseLedgerQuery(params: URLSearchParams): ParsedLedgerQuery {
  const scopeRaw = params.get("scope");
  const scope: TastingScope = isValidTastingScope(scopeRaw) ? scopeRaw : DEFAULT_TASTING_SCOPE;

  const wineStyleRaw = params.get("wineStyle");
  const wineStyle: WineStyle | "all" =
    wineStyleRaw && (WINE_STYLES as string[]).includes(wineStyleRaw) ? (wineStyleRaw as WineStyle) : "all";

  const tastingModeRaw = params.get("tastingMode");
  const tastingMode: TastingMode | "all" =
    tastingModeRaw && (TASTING_MODES as string[]).includes(tastingModeRaw) ? (tastingModeRaw as TastingMode) : "all";

  const yearRaw = params.get("year");
  const yearTasted = yearRaw && /^\d{4}$/.test(yearRaw) ? yearRaw : "all";

  const minRatingRaw = params.get("minRating");
  const minRatingParsed = minRatingRaw ? Number(minRatingRaw) : NaN;
  const minRating: number | "all" =
    Number.isFinite(minRatingParsed) && minRatingParsed >= MIN_RATING_BOUND && minRatingParsed <= MAX_RATING_BOUND
      ? minRatingParsed
      : "all";

  const sortRaw = params.get("sort");
  const sort: LedgerSort = isValidLedgerSort(sortRaw) ? sortRaw : DEFAULT_LEDGER_SORT;

  const pageRaw = Number(params.get("page"));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const countryRaw = (params.get("country") ?? "").slice(0, MAX_COUNTRY_LENGTH);

  return {
    scope,
    filters: {
      search: (params.get("search") ?? "").slice(0, MAX_SEARCH_LENGTH),
      wineStyle,
      country: countryRaw || "all",
      tastingMode,
      yearTasted,
      minRating,
      contributedByYou: params.get("contributedByYou") === "true",
    },
    sort,
    page,
  };
}
