import { SessionStatus, TastingMode } from "@/types/tasting";

// Pure logic for the session-rejoin feature (see README "Session rejoin").
// Kept dependency-free and Supabase-free, per this repo's existing
// convention (lib/archive.ts, lib/profile.ts): Route Handlers do the I/O and
// pass plain data in here, so every branch is unit-testable without mocking
// a client.

/** Strips whitespace/hyphens and uppercases, so "vine 7k4p", "VINE-7K4P",
 * and "vine7k4p" all normalize identically before hashing/comparison. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface IdentityMatch {
  guestId: string;
  displayName: string;
  guestToken: string;
}

export interface JoinSessionSummary {
  publicId: string;
  status: SessionStatus;
  tastingMode: TastingMode | null;
}

export interface JoinResolution {
  session: JoinSessionSummary;
  accountMatch: IdentityMatch | null;
  deviceMatch: IdentityMatch | null;
}

export type JoinScreenState =
  | { kind: "revealed" }
  | { kind: "continue"; identity: IdentityMatch; via: "account" | "guest" }
  | { kind: "conflict"; account: IdentityMatch; guest: IdentityMatch }
  | { kind: "unrecognized" };

/**
 * Turns a resolve_join_identity response into one of the join page's five
 * landing states — see README "Session rejoin" — "QR join precedence" and
 * "Rejoin landing experience". Never merges an account match and a device
 * match that resolve to different participants; only collapses them into a
 * single "continue" state when they agree on the same guest id.
 */
export function deriveJoinScreenState(resolution: JoinResolution): JoinScreenState {
  const { session, accountMatch, deviceMatch } = resolution;

  if (accountMatch && deviceMatch) {
    if (accountMatch.guestId === deviceMatch.guestId) {
      return { kind: "continue", identity: accountMatch, via: "account" };
    }
    return { kind: "conflict", account: accountMatch, guest: deviceMatch };
  }
  if (accountMatch) {
    return { kind: "continue", identity: accountMatch, via: "account" };
  }
  if (deviceMatch) {
    return { kind: "continue", identity: deviceMatch, via: "guest" };
  }

  // No recognized identity at all: a truly new visitor is blocked once the
  // session has moved to 'revealed' (same rule the app already enforces for
  // fresh joins), but a recognized identity above is never blocked here —
  // continuing to view one's own results after reveal is always allowed.
  if (session.status === "revealed") {
    return { kind: "revealed" };
  }

  return { kind: "unrecognized" };
}

/** Where a participant lands after joining/resuming, based purely on the
 * session's own current status — never a client-supplied path, so there is
 * no unsanitized-redirect surface here at all (see README "Session rejoin"
 * — "Participant rejoin destination"). */
export function destinationForStatus(status: SessionStatus, publicId: string): string {
  if (status === "registration") return `/register/${publicId}`;
  if (status === "collecting") return `/tasting/${publicId}`;
  return `/results/${publicId}`;
}
