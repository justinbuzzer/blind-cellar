import { describe, expect, it } from "vitest";
import {
  isReportAvailable,
  resolveReportAccessFromGuestSession,
  resolveReportAccessFromHostSession,
} from "@/lib/reportAccess";
import { GuestSessionStateResponse, HostSessionResponse } from "@/lib/supabase/types";

function makeHostSessionResponse(
  overrides: Partial<HostSessionResponse["session"]> = {}
): HostSessionResponse {
  return {
    session: {
      id: "session-1",
      publicId: "public-1",
      title: "Friday Night Rhône",
      tastingDate: "2026-08-14",
      status: "revealed",
      joinCode: "CLARET-44",
      createdAt: "2026-08-01T00:00:00.000Z",
      hostGuestId: "guest-host",
      tastingMode: "full_blind",
      scoringVersion: "core_v3_appellation_conditional",
      ...overrides,
    },
    wines: [],
    guests: [],
    activeBottle: null,
    seenProgress: null,
  };
}

function makeGuestSessionResponse(
  overrides: Partial<GuestSessionStateResponse["session"]> = {}
): GuestSessionStateResponse {
  return {
    guest: { id: "guest-1", displayName: "Ava", completedAt: null, isHost: false },
    session: {
      id: "session-1",
      publicId: "public-1",
      title: "Friday Night Rhône",
      tastingDate: "2026-08-14",
      status: "revealed",
      tastingMode: "full_blind",
      scoringVersion: "core_v3_appellation_conditional",
      createdAt: "2026-08-01T00:00:00.000Z",
      participantCount: 3,
      ...overrides,
    },
    wines: [],
    guesses: [],
  };
}

describe("resolveReportAccessFromHostSession", () => {
  it("always resolves to the host role", () => {
    const result = resolveReportAccessFromHostSession(makeHostSessionResponse());
    expect(result.role).toBe("host");
    expect(result.session.id).toBe("session-1");
    expect(result.session.publicId).toBe("public-1");
    expect(result.session.status).toBe("revealed");
  });
});

describe("resolveReportAccessFromGuestSession", () => {
  it("resolves to the participant role when the publicId matches", () => {
    const result = resolveReportAccessFromGuestSession(makeGuestSessionResponse(), "public-1");
    expect(result).not.toBeNull();
    expect(result?.role).toBe("participant");
    expect(result?.session.id).toBe("session-1");
  });

  it("returns null on a cross-session publicId mismatch, never leaking the real session", () => {
    const result = resolveReportAccessFromGuestSession(makeGuestSessionResponse(), "some-other-session");
    expect(result).toBeNull();
  });
});

describe("isReportAvailable", () => {
  it("is true only once status is 'revealed'", () => {
    const revealed = resolveReportAccessFromHostSession(makeHostSessionResponse({ status: "revealed" })).session;
    const collecting = resolveReportAccessFromHostSession(makeHostSessionResponse({ status: "collecting" })).session;
    const registration = resolveReportAccessFromHostSession(
      makeHostSessionResponse({ status: "registration" })
    ).session;
    expect(isReportAvailable(revealed)).toBe(true);
    expect(isReportAvailable(collecting)).toBe(false);
    expect(isReportAvailable(registration)).toBe(false);
  });

  it("never infers availability from anything other than status", () => {
    // A session with every other field populated but not yet revealed must
    // still report unavailable — this is the guard against inferring
    // completion from a bottle being revealed, a timer, or a host visit.
    const notYetRevealed = resolveReportAccessFromHostSession(
      makeHostSessionResponse({ status: "collecting", title: "Fully staffed tasting" })
    ).session;
    expect(isReportAvailable(notYetRevealed)).toBe(false);
  });
});
