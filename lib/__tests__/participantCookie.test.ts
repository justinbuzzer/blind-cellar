import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  participantCookieClearOptions,
  participantCookieName,
  participantCookieOptions,
} from "@/lib/participantCookie";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("participantCookieName", () => {
  it("scopes the cookie name to the session's public id", () => {
    expect(participantCookieName("abc-123")).toBe("bc_participant_abc-123");
  });

  it("produces different names for different sessions", () => {
    expect(participantCookieName("session-a")).not.toBe(participantCookieName("session-b"));
  });
});

describe("participantCookieOptions", () => {
  it("is always HttpOnly with SameSite=Lax and a narrow path", () => {
    const options = participantCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/api");
    expect(options.maxAge).toBe(DEVICE_COOKIE_MAX_AGE_SECONDS);
  });

  it("is secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(participantCookieOptions().secure).toBe(true);
  });

  it("is not forced secure outside production, so local HTTP dev still works", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(participantCookieOptions().secure).toBe(false);
  });
});

describe("participantCookieClearOptions", () => {
  it("matches the set options but expires immediately", () => {
    const clear = participantCookieClearOptions();
    const set = participantCookieOptions();
    expect(clear.maxAge).toBe(0);
    expect(clear.httpOnly).toBe(set.httpOnly);
    expect(clear.sameSite).toBe(set.sameSite);
    expect(clear.path).toBe(set.path);
  });
});
