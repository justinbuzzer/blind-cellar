// Pure, client-and-server-safe helpers for the optional account layer (see
// README "Accounts"). These exist so the security/format-relevant logic can
// be unit tested directly — the same pattern already used for scoring and
// archive authorization in this codebase — rather than only exercised live
// against a real Supabase project.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_DISPLAY_NAME_LENGTH = 60;
/** Supabase's email OTP length is a per-project dashboard setting (Authentication → configurable OTP length), not a fixed constant — projects have been seen issuing anywhere from 6 to 8 digits. This UI's copy still says "6-digit code" for the common/default case, but the actual format check accepts the full range Supabase supports so a project configured for a different length isn't silently rejected before ever reaching verifyOtp. */
export const OTP_CODE_MIN_LENGTH = 6;
export const OTP_CODE_MAX_LENGTH = 8;

/** Deliberately simple format check — Supabase itself is the source of truth for deliverability; this only rejects obviously-malformed input before spending a network round trip. */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_PATTERN.test(trimmed);
}

/** A one-time code must be all-digits, within the range of OTP lengths Supabase supports — checked client-side before calling verifyOtp so an obviously-wrong paste never wastes a network round trip or a rate-limited attempt. */
export function isValidOtpFormat(code: string): boolean {
  return new RegExp(`^\\d{${OTP_CODE_MIN_LENGTH},${OTP_CODE_MAX_LENGTH}}$`).test(code.trim());
}

/**
 * Trims and caps an optional account display name, turning an empty/
 * whitespace-only value into null (never stored as ""). This mirrors the
 * server-side trigger in supabase/schema.sql
 * (normalize_profile_display_name) exactly, so the UI never shows a
 * "saved" value the database would have normalized differently — but the
 * database trigger remains the authoritative enforcement, since this field
 * is reachable via a direct client update, not just through this function.
 * Returns null for input that is empty after trimming, and truncates
 * (rather than rejects) input over the max length, matching how a person
 * pasting a too-long name expects "it got shortened," not a hard error for
 * a low-stakes optional field.
 */
export function sanitizeDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH);
}

/** Masks an email for display during OTP verification, e.g. "a***e@example.com" — never the full address is hidden, just enough to confirm it's the right inbox without fully exposing it in shared-screen/screenshot situations. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || local.length === 0) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}
