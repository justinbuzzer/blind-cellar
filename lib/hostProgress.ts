import { bottleLabel } from "./codes";

/**
 * Pure display-formatting helpers for the Host per-bottle response-progress
 * popover (see README "Host per-bottle response progress"). Mirrors
 * lib/seenHostControls.ts's split: this file only ever formats already-known
 * counts/names for the host — the actual eligible/submitted computation
 * happens server-side in get_bottle_response_progress (supabase/schema.sql),
 * since it requires reading wine_guesses, which the client is never granted.
 */

export type BottleResponseKind = "guess" | "rating";

/** "Bottle {number} guess progress" — full_blind/course_reveal popover title. */
export function formatGuessProgressTitle(bottleNumber: number): string {
  return `${bottleLabel(bottleNumber)} guess progress`;
}

/** Seen mode's fixed popover title — wine identity, if shown, is separate muted context below it. */
export const RATING_PROGRESS_TITLE = "Rating progress";

/** "View guess progress for Bottle {number}" / "View rating progress for {label}". */
export function formatProgressAccessibleLabel(
  kind: BottleResponseKind,
  target: { bottleNumber: number } | { wineIdentityLabel: string }
): string {
  if (kind === "rating") {
    const label = "wineIdentityLabel" in target ? target.wineIdentityLabel : "";
    return `View rating progress for ${label}`;
  }
  const bottleNumber = "bottleNumber" in target ? target.bottleNumber : 0;
  return `View guess progress for ${bottleLabel(bottleNumber)}`;
}

/** "View guess progress" / "View rating progress" — the hover/focus tooltip text. */
export function formatProgressTooltip(kind: BottleResponseKind): string {
  return kind === "rating" ? "View rating progress" : "View guess progress";
}

/** "{submittedCount} of {eligibleCount} submitted" / "... rated" — the required status-line copy. */
export function formatProgressStatusLine(
  kind: BottleResponseKind,
  submittedCount: number,
  eligibleCount: number
): string {
  const verb = kind === "rating" ? "rated" : "submitted";
  return `${submittedCount} of ${eligibleCount} ${verb}`;
}

/** "Still to submit" / "Still to rate" — the missing-participants section heading. */
export function formatMissingSectionHeading(kind: BottleResponseKind): string {
  return kind === "rating" ? "Still to rate" : "Still to submit";
}

/** Shown in place of the missing-participants list once nobody is left. */
export function formatAllSubmittedMessage(kind: BottleResponseKind): string {
  return kind === "rating"
    ? "All eligible participants have rated."
    : "All eligible participants have submitted.";
}

/** Shown instead of a status line/missing section when there are no eligible participants at all. */
export const NO_ELIGIBLE_PARTICIPANTS_MESSAGE = "No eligible participants yet.";

/** Polite live-region announcement text for an in-place progress refresh. */
export function formatProgressUpdateAnnouncement(
  kind: BottleResponseKind,
  submittedCount: number,
  eligibleCount: number
): string {
  const verb = kind === "rating" ? "Rating" : "Guess";
  return `${verb} progress updated: ${formatProgressStatusLine(kind, submittedCount, eligibleCount)}.`;
}
