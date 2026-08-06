// Everything Blind Cellar keeps in this browser once Supabase is the source
// of truth: the host token for sessions this device hosts, the guest token
// for sessions this device has joined, and — for the Tasting Archive (see
// README "Tasting archive") — a small index of which (publicId, role) pairs
// this browser has ever held a token for, so they can be looked up again
// later without crawling localStorage's keys directly. The index stores no
// tokens of its own; it only ever points back at the existing per-session
// slots above.

import { ArchiveRole } from "@/lib/archive";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function hostTokenKey(publicId: string): string {
  return `blindCellar.hostToken.${publicId}`;
}

function guestTokenKey(publicId: string): string {
  return `blindCellar.guestToken.${publicId}`;
}

export function getHostToken(publicId: string): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(hostTokenKey(publicId));
}

export function setHostToken(publicId: string, token: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(hostTokenKey(publicId), token);
  addArchiveReference(publicId, "host");
}

export function getGuestToken(publicId: string): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(guestTokenKey(publicId));
}

export function setGuestToken(publicId: string, token: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(guestTokenKey(publicId), token);
  addArchiveReference(publicId, "participant");
}

// ---------------------------------------------------------------------------
// Tasting Archive local reference index
// ---------------------------------------------------------------------------

const ARCHIVE_INDEX_KEY = "blindCellar.archiveRefs";
const MAX_ARCHIVE_REFERENCES = 200;

export interface ArchiveReference {
  publicId: string;
  role: ArchiveRole;
  lastSeenAt: string;
}

function isArchiveReference(value: unknown): value is ArchiveReference {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.publicId === "string" &&
    (v.role === "host" || v.role === "participant") &&
    typeof v.lastSeenAt === "string"
  );
}

function readArchiveIndex(): ArchiveReference[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(ARCHIVE_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isArchiveReference);
  } catch {
    // Corrupt/foreign data in this slot should never break the app — treat
    // it as an empty index rather than throwing.
    return [];
  }
}

function writeArchiveIndex(refs: ArchiveReference[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ARCHIVE_INDEX_KEY, JSON.stringify(refs));
}

/**
 * Records that this browser now holds a token for (publicId, role), so the
 * Tasting Archive can discover it later — called automatically by
 * setHostToken/setGuestToken, never a raw token itself. Deduplicates by
 * (publicId, role) and refreshes lastSeenAt on repeat calls. Bounded to
 * MAX_ARCHIVE_REFERENCES, dropping the oldest entries first, so an
 * unbounded number of long-abandoned sessions can never grow this slot
 * without limit.
 */
export function addArchiveReference(publicId: string, role: ArchiveRole): void {
  if (!isBrowser()) return;
  const existing = readArchiveIndex().filter(
    (ref) => !(ref.publicId === publicId && ref.role === role)
  );
  const next = [...existing, { publicId, role, lastSeenAt: new Date().toISOString() }];
  const bounded = next.length > MAX_ARCHIVE_REFERENCES ? next.slice(next.length - MAX_ARCHIVE_REFERENCES) : next;
  writeArchiveIndex(bounded);
}

export function listArchiveReferences(): ArchiveReference[] {
  return readArchiveIndex();
}

/** Called once the server has confirmed a reference's token is no longer valid — never for a merely not-yet-revealed session. */
export function removeArchiveReference(publicId: string, role: ArchiveRole): void {
  if (!isBrowser()) return;
  writeArchiveIndex(
    readArchiveIndex().filter((ref) => !(ref.publicId === publicId && ref.role === role))
  );
}
