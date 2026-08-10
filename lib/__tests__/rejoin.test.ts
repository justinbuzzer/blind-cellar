import { describe, expect, it } from "vitest";
import {
  IdentityMatch,
  JoinResolution,
  destinationForStatus,
  deriveJoinScreenState,
  normalizeRecoveryCode,
} from "@/lib/rejoin";

function makeMatch(overrides: Partial<IdentityMatch> = {}): IdentityMatch {
  return {
    guestId: "guest-1",
    displayName: "Alice",
    guestToken: "token-1",
    ...overrides,
  };
}

function makeResolution(overrides: Partial<JoinResolution> = {}): JoinResolution {
  return {
    session: { publicId: "pub-1", status: "collecting", tastingMode: "full_blind" },
    accountMatch: null,
    deviceMatch: null,
    ...overrides,
  };
}

describe("normalizeRecoveryCode", () => {
  it("uppercases and strips hyphens/spaces", () => {
    expect(normalizeRecoveryCode("vine-7k4p")).toBe("VINE7K4P");
    expect(normalizeRecoveryCode("VINE 7K4P")).toBe("VINE7K4P");
    expect(normalizeRecoveryCode("vine7k4p")).toBe("VINE7K4P");
  });

  it("strips any other non-alphanumeric characters", () => {
    expect(normalizeRecoveryCode(" 7x-q_k 4m9p ")).toBe("7XQK4M9P");
  });

  it("is idempotent", () => {
    const once = normalizeRecoveryCode("vine-7k4p");
    expect(normalizeRecoveryCode(once)).toBe(once);
  });
});

describe("deriveJoinScreenState", () => {
  it("returns unrecognized when nothing matches and the session is still open", () => {
    const state = deriveJoinScreenState(makeResolution());
    expect(state).toEqual({ kind: "unrecognized" });
  });

  it("blocks with revealed when nothing matches and the session is revealed", () => {
    const state = deriveJoinScreenState(
      makeResolution({ session: { publicId: "pub-1", status: "revealed", tastingMode: "full_blind" } })
    );
    expect(state).toEqual({ kind: "revealed" });
  });

  it("returns continue-via-account when only an account match exists", () => {
    const account = makeMatch({ displayName: "Ava" });
    const state = deriveJoinScreenState(makeResolution({ accountMatch: account }));
    expect(state).toEqual({ kind: "continue", identity: account, via: "account" });
  });

  it("returns continue-via-guest when only a device match exists", () => {
    const guest = makeMatch({ displayName: "Noah" });
    const state = deriveJoinScreenState(makeResolution({ deviceMatch: guest }));
    expect(state).toEqual({ kind: "continue", identity: guest, via: "guest" });
  });

  it("collapses into one continue-via-account when both matches resolve to the same participant", () => {
    const shared = makeMatch({ guestId: "guest-42", displayName: "Ava" });
    const state = deriveJoinScreenState(
      makeResolution({ accountMatch: shared, deviceMatch: { ...shared } })
    );
    expect(state).toEqual({ kind: "continue", identity: shared, via: "account" });
  });

  it("returns a conflict when the account and device matches are different participants", () => {
    const account = makeMatch({ guestId: "guest-1", displayName: "Ava" });
    const guest = makeMatch({ guestId: "guest-2", displayName: "Mia" });
    const state = deriveJoinScreenState(makeResolution({ accountMatch: account, deviceMatch: guest }));
    expect(state).toEqual({ kind: "conflict", account, guest });
  });

  it("never blocks a recognized identity even when the session is revealed", () => {
    const account = makeMatch();
    const state = deriveJoinScreenState(
      makeResolution({
        session: { publicId: "pub-1", status: "revealed", tastingMode: "full_blind" },
        accountMatch: account,
      })
    );
    expect(state.kind).toBe("continue");
  });
});

describe("destinationForStatus", () => {
  it("routes registration to the bottle registration flow", () => {
    expect(destinationForStatus("registration", "pub-1")).toBe("/register/pub-1");
  });

  it("routes collecting to the tasting entry flow", () => {
    expect(destinationForStatus("collecting", "pub-1")).toBe("/tasting/pub-1");
  });

  it("routes revealed to results", () => {
    expect(destinationForStatus("revealed", "pub-1")).toBe("/results/pub-1");
  });
});
