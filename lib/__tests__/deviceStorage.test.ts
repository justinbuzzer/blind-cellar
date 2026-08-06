import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addArchiveReference,
  getGuestToken,
  getHostToken,
  listArchiveReferences,
  removeArchiveReference,
  setGuestToken,
  setHostToken,
} from "@/lib/deviceStorage";

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

describe("archive reference index", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { localStorage: createLocalStorageStub() };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("records a host reference automatically when a host token is stored", () => {
    setHostToken("session-a", "host-token");
    expect(listArchiveReferences()).toEqual([
      expect.objectContaining({ publicId: "session-a", role: "host" }),
    ]);
  });

  it("records a participant reference automatically when a guest token is stored", () => {
    setGuestToken("session-b", "guest-token");
    expect(listArchiveReferences()).toEqual([
      expect.objectContaining({ publicId: "session-b", role: "participant" }),
    ]);
  });

  it("keeps a host reference and its own participant reference (host's own guest row) as two distinct entries", () => {
    setHostToken("session-a", "host-token");
    setGuestToken("session-a", "host-guest-token");
    const refs = listArchiveReferences();
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.role).sort()).toEqual(["host", "participant"]);
  });

  it("never stores raw tokens in the archive index", () => {
    setHostToken("session-a", "super-secret-token");
    const serialized = JSON.stringify(listArchiveReferences());
    expect(serialized).not.toContain("super-secret-token");
  });

  it("does not create a duplicate reference for the same session and role", () => {
    addArchiveReference("session-a", "host");
    addArchiveReference("session-a", "host");
    expect(listArchiveReferences()).toHaveLength(1);
  });

  it("refreshes lastSeenAt without duplicating the entry", () => {
    addArchiveReference("session-a", "host");
    const first = listArchiveReferences()[0].lastSeenAt;
    addArchiveReference("session-a", "host");
    const refs = listArchiveReferences();
    expect(refs).toHaveLength(1);
    expect(typeof refs[0].lastSeenAt).toBe(typeof first);
  });

  it("removes a reference confirmed stale, without touching the existing host/guest token", () => {
    setHostToken("session-a", "host-token");
    removeArchiveReference("session-a", "host");
    expect(listArchiveReferences()).toEqual([]);
    expect(getHostToken("session-a")).toBe("host-token");
  });

  it("returns an empty list when the index has never been written", () => {
    expect(listArchiveReferences()).toEqual([]);
  });

  it("treats corrupt index data as an empty list instead of throwing", () => {
    (globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem(
      "blindCellar.archiveRefs",
      "not valid json"
    );
    expect(() => listArchiveReferences()).not.toThrow();
    expect(listArchiveReferences()).toEqual([]);
  });
});
