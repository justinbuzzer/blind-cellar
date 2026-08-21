import { bottleLabel } from "./codes";
import { HostActiveBottleDTO, HostBottleDTO, HostMatchProgressDTO, HostSeenProgressDTO } from "./supabase/types";
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
 *     (get_host_session's tasting_sessions.active_wine_id row — the bottle
 *     the host explicitly released via release_course_bottle; see README
 *     "Course-by-course host-selected release". The same predicate
 *     get_active_bottle_state/lock_wine_guess/get_bottle_response_progress
 *     all already use). Null both once every bottle is revealed and,
 *     ordinarily, whenever the host simply hasn't released the next bottle
 *     yet — the "choose_next_bottle" state below covers that case, driven
 *     entirely by the existing host-only bottle list, never a predicted or
 *     fabricated "next" bottle.
 *   - full_blind has no server-side "current" bottle at all (any bottle may
 *     be revealed in any order) — the lowest-bottleNumber still-unrevealed
 *     bottle is used here purely as a display suggestion; the existing
 *     detailed per-bottle list remains the actual picker for any other
 *     bottle, unchanged.
 *   - full_blind "submitted" = guests.completedAt (session-wide), the exact
 *     same value HostControlClient already computes for its Submissions
 *     stat and get_bottle_response_progress's full_blind branch use.
 *   - Seen has no per-bottle "current" concept at all (every bottle is
 *     ratable simultaneously; there is no active-bottle predicate anywhere
 *     in get_seen_tasting_state) — see README "Current tasting" for why
 *     Seen's summary is a session-wide rating-progress line plus the
 *     existing "End tasting" action, not a fabricated current bottle.
 */

export type HostCurrentTastingActionType =
  | "reveal_results"
  | "view_results"
  | "end_seen_tasting"
  | "end_match_tasting"
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
  | "choose_next_bottle"
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

/**
 * course_reveal only: no bottle is currently active and the host must
 * explicitly pick the next one from the bottle list below (see README
 * "Course-by-course host-selected release") — there is deliberately no
 * primaryAction/button here, unlike every other kind: the action lives
 * entirely in the existing host-only bottle list, never a second release
 * control duplicated into this summary panel.
 */
export interface HostCurrentTastingChooseNext {
  kind: "choose_next_bottle";
  /** The bottle most recently revealed, if any — absent the very first time a course_reveal session has no active bottle, before anything has ever been revealed. */
  lastRevealedBottle?: HostCurrentTastingBottle;
}

export interface HostCurrentTastingComplete {
  kind: "complete";
  primaryAction: HostCurrentTastingAction;
  secondaryAction?: HostCurrentTastingSecondaryAction;
}

export type HostCurrentTastingState =
  | HostCurrentTastingNoBottles
  | HostCurrentTastingAwaitingResponses
  | HostCurrentTastingChooseNext
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
  /** blind_match only. */
  matchProgress: HostMatchProgressDTO | null;
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
  const {
    tastingMode,
    status,
    wines,
    completedCount,
    eligibleCount,
    activeBottle,
    seenProgress,
    matchProgress,
  } = input;

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

  if (tastingMode === "blind_match") {
    if (wines.length === 0) return { kind: "no_eligible_bottles" };
    const total = matchProgress?.totalPossibleRatings ?? 0;
    const submitted = matchProgress?.ratingsSubmitted ?? 0;
    return {
      kind: "awaiting_responses",
      progress: { completedCount: submitted, eligibleCount: total, noun: "rated" },
      allComplete: total > 0 && submitted === total,
      primaryAction: { type: "end_match_tasting", label: "End tasting and reveal results" },
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

  // No server-computed active bottle while still collecting: the host
  // hasn't released a bottle yet — either nothing has ever been revealed
  // (very first entry into "collecting"), or the previously active bottle
  // was just revealed and the host must explicitly choose what's next (see
  // README "Course-by-course host-selected release" — there is no
  // auto-advance by tasting_order any more). The existing host-only bottle
  // list below this panel is the actual picker; this state deliberately
  // carries no primaryAction of its own. `lastRevealedBottle` (derived from
  // the existing `wines` array, never new client state) is shown only when
  // something has actually been revealed, so the panel never fabricates a
  // "revealed" bottle on a session's very first release.
  const mostRecentlyRevealed = wines
    .filter((w): w is HostBottleDTO & { revealedAt: string } => w.revealedAt !== null)
    .sort((a, b) => b.revealedAt.localeCompare(a.revealedAt))[0];

  return {
    kind: "choose_next_bottle",
    lastRevealedBottle: mostRecentlyRevealed
      ? { label: mostRecentlyRevealed.anonymousCode }
      : undefined,
  };
}
