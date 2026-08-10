import { bottleLabel } from "./codes";
import { HostActiveBottleDTO, HostBottleDTO, HostSeenProgressDTO } from "./supabase/types";
import { SessionStatus, TastingMode } from "@/types/tasting";

/**
 * Pure state resolution for the Host Controls "Current tasting" summary
 * (see README "Current tasting"). Deliberately introduces no new RPC/DTO:
 * every field consumed here already comes back from the existing
 * get_host_session RPC that HostControlClient.tsx already fetches under
 * host-token authorization — this module only decides how to DISPLAY that
 * already-authorized data, exactly like lib/resultsReveal.ts already does
 * for the leaderboard/recap. The actual reveal/end-tasting mutations this
 * section's buttons trigger are the same existing handlers as the detailed
 * Host Controls sections, which independently re-validate host/session/
 * mode/bottle eligibility server-side regardless of what this resolver
 * computes — this module carries no authority of its own.
 *
 * Canonical definitions reused, never reinvented:
 *   - course_reveal "current bottle" = the server-computed `activeBottle`
 *     (get_host_session's earliest-unrevealed-by-tasting_order row — the
 *     same predicate get_active_bottle_state/lock_wine_guess/
 *     get_bottle_response_progress all already use).
 *   - full_blind has no server-side "current" bottle at all (any bottle may
 *     be revealed in any order) — the lowest-bottleNumber still-unrevealed
 *     bottle is used here purely as a display suggestion; the existing
 *     detailed per-bottle list remains the actual picker for any other
 *     bottle, unchanged.
 *   - full_blind "submitted" = guests.completedAt (session-wide), the exact
 *     same value HostControlClient already computes for its Submissions
 *     stat and get_bottle_response_progress's full_blind branch use.
 *   - Seen has no per-bottle "current" concept at all (every bottle is
 *     ratable simultaneously; there is no earliest-unrevealed predicate
 *     anywhere in get_seen_tasting_state) — see README "Current tasting"
 *     for why Seen's summary is a session-wide rating-progress line plus
 *     the existing "End tasting" action, not a fabricated current bottle.
 */

export type HostCurrentTastingActionType =
  | "reveal_results"
  | "view_results"
  | "end_seen_tasting"
  | "view_final_leaderboard";

export interface HostCurrentTastingAction {
  type: HostCurrentTastingActionType;
  label: string;
  /** Present only for reveal_results/view_results — which bottle the action targets. */
  wineId?: string;
}

export interface HostCurrentTastingSecondaryAction {
  type: "view_tasting_recap";
  label: string;
}

export type HostCurrentTastingProgressNoun = "submitted" | "rated";

export interface HostCurrentTastingProgress {
  completedCount: number;
  eligibleCount: number;
  noun: HostCurrentTastingProgressNoun;
}

export interface HostCurrentTastingBottle {
  /** Safe display label only — e.g. "Bottle 3" — never the actual wine identity. */
  label: string;
  courseLabel?: string;
}

export type HostCurrentTastingKind =
  | "no_eligible_bottles"
  | "awaiting_responses"
  | "revealed"
  | "complete";

interface HostCurrentTastingNoBottles {
  kind: "no_eligible_bottles";
}

export interface HostCurrentTastingAwaitingResponses {
  kind: "awaiting_responses";
  /** Absent for Seen, whose summary is session-wide rather than per-bottle. */
  currentBottle?: HostCurrentTastingBottle;
  progress: HostCurrentTastingProgress;
  /** True once completedCount === eligibleCount (and eligibleCount > 0). */
  allComplete: boolean;
  primaryAction: HostCurrentTastingAction;
}

export interface HostCurrentTastingRevealed {
  kind: "revealed";
  currentBottle: HostCurrentTastingBottle;
  primaryAction: HostCurrentTastingAction & { wineId: string };
}

export interface HostCurrentTastingComplete {
  kind: "complete";
  primaryAction: HostCurrentTastingAction;
  secondaryAction?: HostCurrentTastingSecondaryAction;
}

export type HostCurrentTastingState =
  | HostCurrentTastingNoBottles
  | HostCurrentTastingAwaitingResponses
  | HostCurrentTastingRevealed
  | HostCurrentTastingComplete;

export interface HostCurrentTastingInput {
  tastingMode: TastingMode;
  status: SessionStatus;
  wines: HostBottleDTO[];
  /** guests.filter(g => g.completedAt !== null).length — reused from the caller, never recomputed independently. */
  completedCount: number;
  /** guests.length — reused from the caller. */
  eligibleCount: number;
  /** course_reveal only. */
  activeBottle: HostActiveBottleDTO | null;
  /** seen only. */
  seenProgress: HostSeenProgressDTO | null;
}

function completeState(tastingMode: TastingMode): HostCurrentTastingState {
  if (tastingMode === "seen") {
    return {
      kind: "complete",
      primaryAction: { type: "view_results", label: "View shared results" },
    };
  }
  return {
    kind: "complete",
    primaryAction: { type: "view_final_leaderboard", label: "View final leaderboard" },
    secondaryAction: { type: "view_tasting_recap", label: "View tasting recap" },
  };
}

export function resolveHostCurrentTastingState(
  input: HostCurrentTastingInput
): HostCurrentTastingState {
  const { tastingMode, status, wines, completedCount, eligibleCount, activeBottle, seenProgress } =
    input;

  // Every mode reaches `status === "revealed"` only once its own completion
  // rule has already fired (reveal_full_blind_bottle/reveal_bottle's
  // zero-remaining-unrevealed flip, or Seen's explicit end_seen_tasting) —
  // so this is always the true, server-confirmed completion state, never
  // inferred client-side.
  if (status === "revealed") {
    return completeState(tastingMode);
  }

  // status === "registration" is intentionally never passed in by the
  // caller (see HostControlClient.tsx) — registration already has its own
  // complete, dedicated flow (bottle list, participant list, Start tasting),
  // and inventing a "no bottle yet" Current tasting message for that phase
  // would just duplicate it.

  if (tastingMode === "seen") {
    if (wines.length === 0) return { kind: "no_eligible_bottles" };
    const total = seenProgress?.totalPossibleRatings ?? 0;
    const submitted = seenProgress?.ratingsSubmitted ?? 0;
    return {
      kind: "awaiting_responses",
      progress: { completedCount: submitted, eligibleCount: total, noun: "rated" },
      allComplete: total > 0 && submitted === total,
      primaryAction: { type: "end_seen_tasting", label: "End tasting and reveal results" },
    };
  }

  if (tastingMode === "full_blind") {
    if (wines.length === 0) return { kind: "no_eligible_bottles" };
    const nextUnrevealed = wines
      .filter((w) => w.revealedAt === null)
      .sort((a, b) => a.bottleNumber - b.bottleNumber)[0];
    if (!nextUnrevealed) {
      // Defensive only: reveal_full_blind_bottle flips status to "revealed"
      // the instant the last bottle is revealed, so this should be
      // unreachable in practice — but never leaves the host with no action.
      return completeState(tastingMode);
    }
    return {
      kind: "awaiting_responses",
      currentBottle: { label: bottleLabel(nextUnrevealed.bottleNumber) },
      progress: { completedCount, eligibleCount, noun: "submitted" },
      allComplete: eligibleCount > 0 && completedCount === eligibleCount,
      primaryAction: {
        type: "reveal_results",
        label: "Reveal results",
        wineId: nextUnrevealed.id,
      },
    };
  }

  // course_reveal
  if (wines.length === 0) return { kind: "no_eligible_bottles" };

  if (activeBottle) {
    return {
      kind: "awaiting_responses",
      currentBottle: {
        label: activeBottle.anonymousCode,
        courseLabel: `Course ${activeBottle.position}`,
      },
      progress: {
        completedCount: activeBottle.submittedCount,
        eligibleCount: activeBottle.totalParticipants,
        noun: "submitted",
      },
      allComplete:
        activeBottle.totalParticipants > 0 &&
        activeBottle.submittedCount === activeBottle.totalParticipants,
      primaryAction: {
        type: "reveal_results",
        label: "Reveal results",
        wineId: activeBottle.id,
      },
    };
  }

  // No server-computed active bottle while still collecting: the client's
  // own optimistic reveal handler clears activeBottle immediately (see
  // HostControlClient.tsx's handleRevealBottle), ahead of the realtime/poll
  // refetch that will hand back the next course's bottle (or flip status to
  // "revealed" if none remain). Show the most recently revealed bottle
  // (derived from the existing `wines` array, never new client state) so
  // the host always sees a next action rather than a dead panel.
  const mostRecentlyRevealed = wines
    .filter((w): w is HostBottleDTO & { revealedAt: string } => w.revealedAt !== null)
    .sort((a, b) => b.revealedAt.localeCompare(a.revealedAt))[0];

  if (mostRecentlyRevealed) {
    return {
      kind: "revealed",
      currentBottle: { label: mostRecentlyRevealed.anonymousCode },
      primaryAction: {
        type: "view_results",
        label: "View results",
        wineId: mostRecentlyRevealed.id,
      },
    };
  }

  return { kind: "no_eligible_bottles" };
}
