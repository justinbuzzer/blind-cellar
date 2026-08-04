import { randomBytes, createHash } from "crypto";

// Server-only (uses Node's crypto module). Used for host tokens, which are
// generated and hashed in a Route Handler, never inside the browser.

/** A high-entropy, URL-safe random token (256 bits). */
export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

/** One-way SHA-256 hash of a token, for storage instead of the raw value. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
