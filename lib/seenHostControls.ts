import { normalizeText } from "./normalize";

/**
 * Pure display-formatting helpers for Seen Host Controls (see README "Seen
 * Host Controls"). Kept separate from lib/seenResults.ts (the final-report
 * ranking/aggregation pipeline) since these only ever format already-known
 * values for the host's collecting-stage view — no ranking, no aggregation
 * across bottles, nothing here talks to Supabase.
 */

export interface SeenWineIdentity {
  producer: string;
  wineCuvee: string;
}

/** "Producer — Wine/cuvée" — the primary display for a Seen Host Controls bottle row. */
export function formatSeenWineIdentity(wine: SeenWineIdentity): string {
  return `${wine.producer} — ${wine.wineCuvee}`;
}

export interface SeenWineSecondary {
  vintage: string;
  appellation?: string | null;
  region?: string | null;
  country?: string | null;
}

/**
 * "Vintage/NV · Appellation, Region · Country" secondary metadata line.
 * Appellation appears before region; a region identical to the appellation
 * (after normalisation, e.g. an unsplit "Champagne") is never repeated;
 * missing values are omitted cleanly rather than showing an empty segment.
 */
export function formatSeenWineSecondaryLine(wine: SeenWineSecondary): string {
  const appellation = wine.appellation?.trim();
  const region = wine.region?.trim();
  const country = wine.country?.trim();

  const localParts: string[] = [];
  if (appellation) localParts.push(appellation);
  if (region && normalizeText(region) !== normalizeText(appellation ?? "")) {
    localParts.push(region);
  }
  const local = localParts.join(", ");

  return [wine.vintage, [local, country].filter(Boolean).join(" · ")]
    .filter(Boolean)
    .join(" · ");
}

/** "{ratedCount} of {eligibleCount} rated" — the exact required rating-status copy. */
export function formatSeenRatingStatus(ratedCount: number, eligibleCount: number): string {
  return `${ratedCount} of ${eligibleCount} rated`;
}

/** "Group rating: 92.4", or "No ratings submitted" when there are no valid ratings to average. */
export function formatSeenGroupRating(groupRating: number | null): string {
  return groupRating === null ? "No ratings submitted" : `Group rating: ${groupRating.toFixed(1)}`;
}
