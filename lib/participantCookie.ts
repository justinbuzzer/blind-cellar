// Pure helpers for the session-rejoin device credential cookie (see README
// "Session rejoin"). Deliberately has no Next.js/`next/headers` import so it
// stays unit-testable like every other lib module in this repo — the actual
// `cookies()`/`NextResponse` calls live only in the Route Handlers under
// app/api/join/, which are the sole readers/writers of this cookie. No page
// or client component ever reads it (it's HttpOnly, so the browser wouldn't
// let client JS read it anyway, but the Route-Handler-only convention here
// is a second, independent guardrail).

const COOKIE_PREFIX = "bc_participant_";

// Matches the device_session credential's own server-side expiry
// (see supabase/schema.sql) — the cookie should never outlive the
// credential it carries.
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/** One cookie per tasting session this device has joined, scoped by the
 * session's own public id (already public, e.g. via the QR code) — never a
 * secret in itself, just a lookup key. */
export function participantCookieName(publicId: string): string {
  return `${COOKIE_PREFIX}${publicId}`;
}

export interface ParticipantCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/api";
  maxAge: number;
}

/** Options for setting the cookie. `secure` follows NODE_ENV rather than a
 * hardcoded true, so local HTTP development still works — matches how the
 * rest of this app treats production-only hardening. */
export function participantCookieOptions(): ParticipantCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  };
}

/** Options for clearing the cookie ("This isn't me" — see README). Same
 * scoping attributes as when it was set (a cookie is only ever matched and
 * overwritten by name+path+domain), with maxAge 0 to expire it immediately. */
export function participantCookieClearOptions(): ParticipantCookieOptions {
  return { ...participantCookieOptions(), maxAge: 0 };
}
