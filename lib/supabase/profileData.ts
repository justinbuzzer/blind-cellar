import { SupabaseClient } from "@supabase/supabase-js";
import { ScoringVersion, SessionStatus, TastingMode } from "@/types/tasting";
import { AccountTastingRecordRow } from "@/lib/supabase/types";
import { loadTastingReportData } from "./reportData";
import {
  buildWineObservationsForSession,
  resolveSessionLinks,
  SessionLink,
  SessionMeta,
  WineObservation,
} from "@/lib/profile";

interface SessionRowWithHost {
  id: string;
  public_id: string;
  title: string;
  tasting_date: string;
  status: SessionStatus;
  tasting_mode: TastingMode;
  scoring_version: ScoringVersion;
  created_at: string;
  host_guest_id: string | null;
}

export interface ProfileData {
  /** One per revealed, account-linked session — deduplicated (see resolveSessionLinks). */
  sessionLinks: SessionLink[];
  sessionMetaById: Map<string, SessionMeta>;
  /** Every wine observation across every revealed, account-linked session, in every tasting mode — callers filter by scope/mode themselves (see lib/profile.ts). */
  observations: WineObservation[];
}

const EMPTY_PROFILE_DATA: ProfileData = {
  sessionLinks: [],
  sessionMetaById: new Map(),
  observations: [],
};

/**
 * Loads everything the Palate Profile needs for the signed-in caller (see
 * README "Palate Profile"). `supabase` must be the cookie-aware, RLS-bound
 * client (see lib/supabase/routeHandlerClient.ts) — account_tasting_records
 * only ever returns the caller's own rows, so no user id is threaded through
 * here or trusted from the client. Every session's report is built via the
 * exact same loadTastingReportData the final-report page and archive already
 * use — no scoring is recomputed, and only revealed sessions are considered.
 */
export async function loadProfileData(supabase: SupabaseClient): Promise<ProfileData> {
  const { data: recordRows, error: recordsError } = await supabase
    .from("account_tasting_records")
    .select("session_id, role, participant_id, claimed_at, claim_source");

  if (recordsError || !recordRows || recordRows.length === 0) {
    return EMPTY_PROFILE_DATA;
  }
  const records = recordRows as AccountTastingRecordRow[];

  const sessionIds = Array.from(new Set(records.map((r) => r.session_id)));
  const { data: sessionRowsRaw, error: sessionsError } = await supabase
    .from("tasting_sessions")
    .select("id, public_id, title, tasting_date, status, tasting_mode, scoring_version, created_at, host_guest_id")
    .in("id", sessionIds);

  if (sessionsError || !sessionRowsRaw) {
    return EMPTY_PROFILE_DATA;
  }
  const sessionRows = sessionRowsRaw as SessionRowWithHost[];

  const revealedSessionRows = sessionRows.filter((s) => s.status === "revealed");
  const revealedSessionIds = new Set(revealedSessionRows.map((s) => s.id));
  const hostGuestIdBySession = new Map(revealedSessionRows.map((s) => [s.id, s.host_guest_id]));

  const eligibleRecords = records.filter((r) => revealedSessionIds.has(r.session_id));
  const sessionLinks = resolveSessionLinks(eligibleRecords, hostGuestIdBySession);

  const sessionMetaById = new Map<string, SessionMeta>();
  const observationLists = await Promise.all(
    sessionLinks.map(async (link): Promise<WineObservation[]> => {
      const row = revealedSessionRows.find((s) => s.id === link.sessionId);
      if (!row) return [];

      const [reportData, participantCountResult] = await Promise.all([
        loadTastingReportData(supabase, {
          id: row.id,
          tastingMode: row.tasting_mode,
          scoringVersion: row.scoring_version,
        }),
        supabase.from("guests").select("id", { count: "exact", head: true }).eq("session_id", row.id),
      ]);

      const bottleCount =
        reportData.kind === "seen" || reportData.kind === "match"
          ? reportData.report.bottleResults.length
          : reportData.report.wineResults.length;

      const meta: SessionMeta = {
        sessionId: row.id,
        publicId: row.public_id,
        title: row.title,
        tastingDate: row.tasting_date || row.created_at,
        createdAt: row.created_at,
        tastingMode: row.tasting_mode,
        bottleCount,
        participantCount: participantCountResult.count ?? 0,
      };
      sessionMetaById.set(link.sessionId, meta);

      if (!link.engagementGuestId) return [];
      return buildWineObservationsForSession(meta, reportData, link.engagementGuestId, link.role);
    })
  );

  return {
    sessionLinks,
    sessionMetaById,
    observations: observationLists.flat(),
  };
}
