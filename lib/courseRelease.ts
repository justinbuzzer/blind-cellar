import { bottleLabel, formatBlindBottleLabel } from "./codes";

/**
 * Pure host-selection eligibility/copy helpers for Course-by-course's
 * host-selected non-sequential release — see README "Course-by-course
 * host-selected release". The server (release_course_bottle in
 * supabase/schema.sql) is the sole authority on whether a release actually
 * succeeds; this module only decides what the Host Controls bottle list
 * should render, exactly like lib/hostCurrentTasting.ts does for the
 * Current tasting summary.
 */

/**
 * A bottle may be released only when no other Course bottle is currently
 * active and this one hasn't already been revealed. Deliberately says
 * nothing about tasting_order/bottle_number — any eligible unrevealed
 * bottle may be chosen, in any order.
 */
export function isCourseBottleReleasable(
  wine: { revealedAt: string | null },
  activeWineId: string | null
): boolean {
  return activeWineId === null && wine.revealedAt === null;
}

export function formatReleaseBottleConfirmTitle(bottleNumber: number): string {
  return `Release ${bottleLabel(bottleNumber)}?`;
}

/** Exact required accessible label, e.g. "Release Bottle 3, brought by Mia". */
export function formatReleaseBottleAriaLabel(
  bottleNumber: number,
  contributorName?: string | null
): string {
  const name = contributorName?.trim();
  return name
    ? `Release ${bottleLabel(bottleNumber)}, brought by ${name}`
    : `Release ${bottleLabel(bottleNumber)}`;
}

/** Row label — reuses the same "Bottle N — Contributor" format every other host-only bottle list already uses. */
export function formatCourseBottleRowLabel(
  bottleNumber: number,
  contributorName?: string | null
): string {
  return formatBlindBottleLabel(bottleNumber, contributorName);
}
