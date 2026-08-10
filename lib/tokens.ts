import { randomBytes, randomInt, createHash } from "crypto";

// Server-only (uses Node's crypto module). Used for host tokens, which are
// generated and hashed in a Route Handler, never inside the browser. Also
// used for the session-rejoin feature's device credentials and recovery
// codes (see README "Session rejoin") — same generate-and-hash-in-Node,
// store-only-the-hash-in-Postgres pattern as the host token above.

/** A high-entropy, URL-safe random token (256 bits). */
export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

/** One-way SHA-256 hash of a token, for storage instead of the raw value. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Excludes visually-ambiguous characters (I, L, O, 0, 1) so a guest reading
// a recovery code off a screen or a printed handout can type it back
// correctly — see README "Session rejoin" — "Recovery code format".
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_CODE_LENGTH = 8;

/**
 * A human-enterable one-time recovery code, e.g. "7XQK-4M9P" — two groups of
 * four characters from a reduced, ambiguity-free alphabet (~39.6 bits of
 * entropy), generated with a cryptographically secure RNG
 * (`crypto.randomInt`, not `Math.random`). Single-use and session-scoped
 * enforcement happen server-side in Postgres (see redeem_recovery_code in
 * supabase/schema.sql); this function only ever produces the raw value.
 */
export function generateRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    raw += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
