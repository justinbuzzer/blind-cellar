import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getGuestToken, getHostToken, setGuestToken, setHostToken } from "@/lib/deviceStorage";

// deviceStorage only ever touches `window.localStorage`, guarded by a
// `typeof window !== "undefined"` check — no jsdom needed, a plain in-memory
// stub is enough to exercise the real storage/lookup logic under the
// project's node test environment.
function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  };
}

describe("host token storage", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { localStorage: createLocalStorageStub() };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("round-trips a host token for its session", () => {
    setHostToken("session-a", "token-a");
    expect(getHostToken("session-a")).toBe("token-a");
  });

  it("never returns a host token stored for a different session (mismatch protection)", () => {
    setHostToken("session-a", "token-a");
    expect(getHostToken("session-b")).toBeNull();
  });

  it("returns null when no host token has ever been stored for a session", () => {
    expect(getHostToken("never-hosted")).toBeNull();
  });

  it("keeps host and guest tokens for the same session independent", () => {
    setHostToken("session-a", "host-token");
    setGuestToken("session-a", "guest-token");
    expect(getHostToken("session-a")).toBe("host-token");
    expect(getGuestToken("session-a")).toBe("guest-token");
  });
});
