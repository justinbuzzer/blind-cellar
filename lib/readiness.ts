import { NO_ELIGIBLE_PARTICIPANTS_MESSAGE } from "./hostProgress";

/**
 * Pure display-formatting/summarizing helpers for participant readiness
 * confirmation (see README "Participant readiness confirmation"). Mirrors
 * lib/hostProgress.ts's split: eligibility/readiness itself is already
 * known server-side (guests.ready_to_begin_at, realtime-subscribed into
 * HostControlClient's `guests` state) — this file only ever formats or
 * summarizes an already-fetched guests array, never fetches or computes
 * eligibility on its own.
 */

export { NO_ELIGIBLE_PARTICIPANTS_MESSAGE };

/** Minimal shape this module needs from a guest row — deliberately not the full HostGuestDTO, so callers can't accidentally pass sensitive fields through to something that renders this. */
export interface ReadinessGuest {
  displayName: string;
  readyToBeginAt: string | null;
}

export interface ReadinessSummary {
  readyCount: number;
  eligibleCount: number;
  /** Safe display names only, for participants who have not yet marked ready. Never includes ready participants' names. */
  notReadyNames: string[];
}

/**
 * Derives the host readiness count + not-ready-names list from the same
 * eligible-participant set already used everywhere else in this app (every
 * row in `guests` for the session — see README "Host per-bottle response
 * progress" for the identical denominator). The host is just one guests row
 * like any other, so it's counted here automatically, exactly once, with no
 * special-casing.
 */
export function summarizeReadiness(guests: ReadinessGuest[]): ReadinessSummary {
  const notReadyNames = guests
    .filter((g) => !g.readyToBeginAt)
    .map((g) => g.displayName);
  return {
    readyCount: guests.length - notReadyNames.length,
    eligibleCount: guests.length,
    notReadyNames,
  };
}

/**
 * "0 of 8 participants are ready" / "1 of 8 participant is ready" / "6 of 8
 * participants are ready" — the required exact copy. Singular/plural
 * agreement is driven by readyCount (not eligibleCount) — an intentional,
 * spec-required construction: "1 of 8 participant is ready" describes the
 * one who is ready, not the group of 8.
 */
export function formatReadinessCountLine(readyCount: number, eligibleCount: number): string {
  const noun = readyCount === 1 ? "participant is" : "participants are";
  return `${readyCount} of ${eligibleCount} ${noun} ready`;
}

/** "View participants not ready. 6 of 8 participants are ready." — the host readiness trigger's accessible name. */
export function formatReadinessAccessibleLabel(readyCount: number, eligibleCount: number): string {
  return `View participants not ready. ${formatReadinessCountLine(readyCount, eligibleCount)}.`;
}

/** Polite live-region announcement text for an in-place readiness count update on Host Controls. */
export function formatReadinessUpdateAnnouncement(readyCount: number, eligibleCount: number): string {
  return `Readiness updated: ${formatReadinessCountLine(readyCount, eligibleCount)}.`;
}

/** Popover title when at least one eligible participant is not yet ready. */
export const NOT_READY_POPOVER_TITLE = "Not ready yet";

/** Shown in the popover in place of the not-ready list once everyone is ready. */
export const EVERYONE_READY_MESSAGE = "Everyone is ready to begin.";

/** Live-region announcement text for the participant page's own successful mark-ready action. */
export const PARTICIPANT_READY_ANNOUNCEMENT = "You are ready to begin.";
