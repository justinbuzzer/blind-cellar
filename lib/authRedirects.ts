// Validates a "return to this page after sign-in" path against an allowlist
// of internal same-origin paths, so a crafted `?redirect=` query parameter
// can never send a user to an external site after they authenticate (a
// classic open-redirect). See README "Accounts" and app/account/sign-in.

const DEFAULT_SAFE_PATH = "/account";

/**
 * A path is safe only if it is a bare, same-origin, app-relative path:
 * starts with exactly one `/` (not `//`, which browsers treat as
 * protocol-relative to an external host), contains no scheme (`http:`,
 * `javascript:`, etc.), and has no whitespace/control characters that could
 * be used to smuggle a scheme past a naive check. Query strings and hashes
 * on an otherwise-safe path are left intact.
 */
export function isSafeReturnPath(path: string | null | undefined): boolean {
  if (!path) return false;
  if (path.length === 0 || path.length > 2048) return false;
  if (/[\s\x00-\x1f]/.test(path)) return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  // Guards against "/\evil.com"-style backslash tricks some browsers/URL
  // parsers normalize into a protocol-relative URL.
  if (path.includes("\\")) return false;
  // A bare path must never itself contain a scheme separator.
  if (path.includes("://")) return false;
  return true;
}

/** Returns the given path if safe, otherwise the app's default post-sign-in destination. */
export function resolveSafeReturnPath(path: string | null | undefined): string {
  return isSafeReturnPath(path) ? (path as string) : DEFAULT_SAFE_PATH;
}
