import { TastingMode, WineAnswerKey } from "@/types/tasting";
import { GuestSessionStateResponse, HostSessionResponse } from "@/lib/supabase/types";
import { ReportData } from "@/lib/supabase/reportData";
import { round1 } from "./math";

// ---------------------------------------------------------------------------
// The Tasting Archive is browser-linked, not account-linked (see README
// "Tasting archive"): a browser's own localStorage remembers *which*
// sessions it once held a host or guest token for (lib/deviceStorage.ts),
// and this module is the server-side counterpart that turns that list of
// bare references into an authorized, minimized archive — by re-validating
// every token through the exact same SECURITY DEFINER RPCs the rest of the
// app already uses (get_host_session / get_guest_session_state), never a
// new, broader read path. Everything here is pure and dependency-injected so
// the privacy-critical classification logic (valid vs. invalid vs.
// not-yet-revealed, dedup, ordering) can be unit tested with fakes, the same
// way lib/results.ts's scoring engine is — no network/Supabase mocking
// required.
// ---------------------------------------------------------------------------

export type ArchiveRole = "host" | "participant";

/** Hard cap on how many local references one lookup request will resolve — see parseArchiveLookupRequest. */
export const MAX_ARCHIVE_LOOKUP_ITEMS = 30;

/** What the client sends: one local reference's role and the token already stored for it, never anything else. */
export interface ArchiveLookupRequestItem {
  publicId: string;
  role: ArchiveRole;
  token: string;
}

export interface ArchiveWineHighlight {
  bottleLabel: string;
  wineIdentity: string;
}

/** The minimized, rendered-safe DTO for one archive row — no tokens, no join codes, no other guests' data. */
export interface ArchiveEntry {
  publicId: string;
  role: ArchiveRole;
  title: string;
  tastingDate: string;
  createdAt: string;
  tastingMode: TastingMode;
  bottleCount: number;
  participantCount: number;
  wineOfTheNight: ArchiveWineHighlight | null;
  /** This identity's own blind-identification accuracy (full_blind/course_reveal only); null for seen tasting or when unavailable. */
  accuracyPercent: number | null;
}

/**
 * "invalid" covers a rejected/missing token, a session that no longer exists,
 * or a guest token that resolves to a different session than the reference
 * claimed — anything that means this local reference is no longer trustworthy
 * and should be forgotten. "not_revealed" means the credential is genuinely
 * valid but the session simply isn't finished yet, so the reference should be
 * kept for later. Distinguishing the two is safe here (unlike a public-facing
 * error message) because it is only ever returned to the browser that already
 * holds that exact token — see README "Tasting archive" privacy model.
 */
export type ArchiveLookupStatus = "ready" | "not_revealed" | "invalid";

export interface ArchiveLookupResultItem {
  publicId: string;
  role: ArchiveRole;
  status: ArchiveLookupStatus;
  entry?: ArchiveEntry;
}

export interface ArchiveResolutionDeps {
  getHostSession: (publicId: string, token: string) => Promise<HostSessionResponse | null>;
  getGuestSessionState: (token: string) => Promise<GuestSessionStateResponse | null>;
  loadReport: (session: { id: string; tastingMode: TastingMode }) => Promise<ReportData>;
}

function formatWineIdentity(wine: WineAnswerKey): string {
  return `${wine.producer} — ${wine.wineName} ${wine.vintage}`.trim();
}

function buildWineHighlight(wine: WineAnswerKey | undefined): ArchiveWineHighlight | null {
  if (!wine) return null;
  return { bottleLabel: wine.code, wineIdentity: formatWineIdentity(wine) };
}

function reportWineOfTheNight(report: ReportData): WineAnswerKey | undefined {
  return report.kind === "seen"
    ? report.report.wineOfTheNight[0]?.wine
    : report.report.wineOfTheNight[0]?.wine;
}

/** Full_blind/course_reveal only — seen tasting has no scoring, so this always returns null there. */
function ownAccuracy(
  report: ReportData,
  ownGuestId: string,
  tastingMode: TastingMode
): number | null {
  if (tastingMode === "seen" || report.kind !== "standard") return null;
  const own = report.report.tasterResults.find((t) => t.guestId === ownGuestId);
  return own ? own.overallAccuracyPercent : null;
}

async function resolveHostItem(
  item: ArchiveLookupRequestItem,
  deps: ArchiveResolutionDeps
): Promise<ArchiveLookupResultItem> {
  let data: HostSessionResponse | null;
  try {
    data = await deps.getHostSession(item.publicId, item.token);
  } catch {
    data = null;
  }
  if (!data) {
    return { publicId: item.publicId, role: "host", status: "invalid" };
  }
  if (data.session.status !== "revealed") {
    return { publicId: item.publicId, role: "host", status: "not_revealed" };
  }

  const report = await deps.loadReport({
    id: data.session.id,
    tastingMode: data.session.tastingMode,
  });

  const entry: ArchiveEntry = {
    publicId: item.publicId,
    role: "host",
    title: data.session.title,
    tastingDate: data.session.tastingDate,
    createdAt: data.session.createdAt,
    tastingMode: data.session.tastingMode,
    bottleCount: data.wines.length,
    participantCount: data.guests.length,
    wineOfTheNight: buildWineHighlight(reportWineOfTheNight(report)),
    accuracyPercent: data.session.hostGuestId
      ? ownAccuracy(report, data.session.hostGuestId, data.session.tastingMode)
      : null,
  };
  return { publicId: item.publicId, role: "host", status: "ready", entry };
}

async function resolveParticipantItem(
  item: ArchiveLookupRequestItem,
  deps: ArchiveResolutionDeps
): Promise<ArchiveLookupResultItem> {
  let data: GuestSessionStateResponse | null;
  try {
    data = await deps.getGuestSessionState(item.token);
  } catch {
    data = null;
  }
  // get_guest_session_state derives the session purely from the token, never
  // from a caller-supplied id — so a token that resolves to a *different*
  // session than the reference claims is treated exactly like an invalid
  // token, never trusted against the client's own labeling.
  if (!data || data.session.publicId !== item.publicId) {
    return { publicId: item.publicId, role: "participant", status: "invalid" };
  }
  if (data.session.status !== "revealed") {
    return { publicId: item.publicId, role: "participant", status: "not_revealed" };
  }

  const report = await deps.loadReport({
    id: data.session.id,
    tastingMode: data.session.tastingMode,
  });

  const entry: ArchiveEntry = {
    publicId: item.publicId,
    role: "participant",
    title: data.session.title,
    tastingDate: data.session.tastingDate,
    createdAt: data.session.createdAt,
    tastingMode: data.session.tastingMode,
    bottleCount: data.wines.length,
    participantCount: data.session.participantCount,
    wineOfTheNight: buildWineHighlight(reportWineOfTheNight(report)),
    accuracyPercent: ownAccuracy(report, data.guest.id, data.session.tastingMode),
  };
  return { publicId: item.publicId, role: "participant", status: "ready", entry };
}

/**
 * Resolves every locally-referenced session independently — one bad/invalid
 * item never affects the others — and never accepts a role it wasn't asked
 * to validate. Input is expected to already be bounded by
 * parseArchiveLookupRequest; this function bounds it again defensively.
 */
export async function resolveArchiveEntries(
  items: ArchiveLookupRequestItem[],
  deps: ArchiveResolutionDeps
): Promise<ArchiveLookupResultItem[]> {
  const bounded = items.slice(0, MAX_ARCHIVE_LOOKUP_ITEMS);
  return Promise.all(
    bounded.map((item) =>
      item.role === "host" ? resolveHostItem(item, deps) : resolveParticipantItem(item, deps)
    )
  );
}

/**
 * Turns raw resolution results into what the archive list actually renders:
 * only "ready" items, one row per session even if both a host and a
 * participant reference resolved for it (host wins — see README "Tasting
 * archive"), ordered by tasting date descending with createdAt as the
 * tiebreak.
 */
export function selectDisplayEntries(items: ArchiveLookupResultItem[]): ArchiveEntry[] {
  const byPublicId = new Map<string, ArchiveEntry>();
  for (const item of items) {
    if (item.status !== "ready" || !item.entry) continue;
    const existing = byPublicId.get(item.entry.publicId);
    if (!existing || (existing.role !== "host" && item.entry.role === "host")) {
      byPublicId.set(item.entry.publicId, item.entry);
    }
  }
  return Array.from(byPublicId.values()).sort((a, b) => {
    if (a.tastingDate !== b.tastingDate) return a.tastingDate < b.tastingDate ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return 0;
  });
}

export function splitByRole(entries: ArchiveEntry[]): {
  hosted: ArchiveEntry[];
  joined: ArchiveEntry[];
} {
  return {
    hosted: entries.filter((e) => e.role === "host"),
    joined: entries.filter((e) => e.role === "participant"),
  };
}

export type ArchiveTabId = "hosted" | "joined";

/** Defaults to "hosted" only when it actually has entries — otherwise "joined", even if that's also empty. */
export function defaultArchiveTab(hosted: ArchiveEntry[]): ArchiveTabId {
  return hosted.length > 0 ? "hosted" : "joined";
}

export interface ArchiveSummary {
  completedCount: number;
  bottlesTasted: number;
  /** Null whenever there isn't at least one blind-mode entry with scoring data — never shown as 0. */
  averageAccuracyPercent: number | null;
}

/** Computed only from the already-authorized entries for one tab — never a cross-session/global figure. */
export function buildArchiveSummary(entries: ArchiveEntry[]): ArchiveSummary {
  const accuracies = entries
    .map((e) => e.accuracyPercent)
    .filter((a): a is number => a !== null);
  return {
    completedCount: entries.length,
    bottlesTasted: entries.reduce((sum, e) => sum + e.bottleCount, 0),
    averageAccuracyPercent: accuracies.length
      ? round1(accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length)
      : null,
  };
}

/** References the server has confirmed are no longer valid — safe for the client to forget (see lib/deviceStorage.ts). Never includes merely not-yet-revealed sessions. */
export function staleReferences(
  items: ArchiveLookupResultItem[]
): { publicId: string; role: ArchiveRole }[] {
  return items
    .filter((i) => i.status === "invalid")
    .map((i) => ({ publicId: i.publicId, role: i.role }));
}

/**
 * Validates and bounds the raw request body for POST /api/archive/lookup.
 * Returns null on anything malformed so the route can respond with one
 * generic 400 — never echoing back which field was wrong.
 */
export function parseArchiveLookupRequest(body: unknown): ArchiveLookupRequestItem[] | null {
  if (!body || typeof body !== "object") return null;
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  if (items.length > MAX_ARCHIVE_LOOKUP_ITEMS) return null;

  const parsed: ArchiveLookupRequestItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") return null;
    const { publicId, role, token } = raw as Record<string, unknown>;
    if (typeof publicId !== "string" || publicId.length === 0 || publicId.length > 100) {
      return null;
    }
    if (role !== "host" && role !== "participant") return null;
    if (typeof token !== "string" || token.length === 0 || token.length > 500) return null;
    parsed.push({ publicId, role, token });
  }
  return parsed;
}
