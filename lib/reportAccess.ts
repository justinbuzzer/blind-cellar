import {
  GuestSessionStateResponse,
  HostSessionResponse,
} from "./supabase/types";
import { ScoringVersion, SessionStatus, TastingMode } from "@/types/tasting";

/**
 * Access resolution for the completed-tasting shared report (see README
 * "Results reveal" — "Completed-tasting report access"). Pure mapping/
 * eligibility logic only, deliberately separated from the async token
 * lookups in app/results/[publicId]/page.tsx so it's independently
 * testable — this codebase has no component-test harness (see README
 * "Automated tests"), so anything worth testing here has to live in lib/.
 */

export type ReportViewerRole = "host" | "participant";

export interface ReportAccessSession {
  id: string;
  publicId: string;
  title: string;
  tastingDate: string;
  status: SessionStatus;
  tastingMode: TastingMode;
  /** Immutable, assigned at creation — see ScoringVersion. Meaningless for seen sessions. */
  scoringVersion: ScoringVersion;
}

export interface ReportAccessResult {
  role: ReportViewerRole;
  session: ReportAccessSession;
}

/** A successful `get_host_session` response always means the caller is this session's host. */
export function resolveReportAccessFromHostSession(
  response: HostSessionResponse
): ReportAccessResult {
  return {
    role: "host",
    session: {
      id: response.session.id,
      publicId: response.session.publicId,
      title: response.session.title,
      tastingDate: response.session.tastingDate,
      status: response.session.status,
      tastingMode: response.session.tastingMode,
      scoringVersion: response.session.scoringVersion,
    },
  };
}

/**
 * A successful `get_guest_session_state` response means the caller is an
 * active participant of *some* session — `expectedPublicId` is a
 * defense-in-depth check that it's specifically the one being requested
 * (a mismatch shouldn't be reachable in practice, since a guest token is
 * only ever resolved for the session it was issued for, but this keeps the
 * caller from ever rendering a different session's report on a stale/wrong
 * cross-session token without an explicit check). Returns null on mismatch
 * so the caller can fall through to the same generic denial used for "no
 * credential at all" — never a distinguishing error.
 */
export function resolveReportAccessFromGuestSession(
  response: GuestSessionStateResponse,
  expectedPublicId: string
): ReportAccessResult | null {
  if (response.session.publicId !== expectedPublicId) return null;
  return {
    role: "participant",
    session: {
      id: response.session.id,
      publicId: response.session.publicId,
      title: response.session.title,
      tastingDate: response.session.tastingDate,
      status: response.session.status,
      tastingMode: response.session.tastingMode,
      scoringVersion: response.session.scoringVersion,
    },
  };
}

/**
 * The canonical "tasting is complete" condition this report unlocks on —
 * reused verbatim from the same `status = 'revealed'` check every other
 * post-tasting feature in this app already uses (see README "Session
 * lifecycle" / "Results reveal"). Full blind and course_reveal only reach
 * this status once every one of their bottles has already been individually
 * revealed; seen reaches it via one host-triggered action. Never inferred
 * from a bottle being revealed, a timer, or client-supplied state.
 */
export function isReportAvailable(session: ReportAccessSession): boolean {
  return session.status === "revealed";
}
