import { describe, expect, it } from "vitest";
import {
  AccountArchiveResolutionDeps,
  AccountSessionSummary,
  accountLinkedPublicIds,
  ArchiveEntry,
  ArchiveLookupResultItem,
  ArchiveResolutionDeps,
  buildArchiveSummary,
  defaultArchiveTab,
  MAX_ARCHIVE_LOOKUP_ITEMS,
  parseArchiveLookupRequest,
  parseClaimRequest,
  resolveAccountEntries,
  resolveArchiveEntries,
  selectDisplayEntries,
  splitByRole,
  staleReferences,
} from "@/lib/archive";
import {
  AccountTastingRecordRow,
  GuestSessionStateResponse,
  HostSessionResponse,
} from "@/lib/supabase/types";
import { ReportData } from "@/lib/supabase/reportData";
import { TastingReport, WineAnswerKey } from "@/types/tasting";

function wine(overrides: Partial<WineAnswerKey> = {}): WineAnswerKey {
  return {
    id: "wine-1",
    code: "Bottle 4",
    country: "France",
    region: "Burgundy",
    grapeBlendMode: "single",
    grapeBlend: "Pinot Noir",
    producer: "Domaine Example",
    wineName: "Nuits-Saint-Georges",
    vintage: "2021",
    wineStyle: "red",
    tastingOrder: 4,
    ...overrides,
  };
}

function standardReport(overrides: Partial<TastingReport> = {}): ReportData {
  return {
    kind: "standard",
    report: {
      wineResults: [],
      tasterResults: [],
      wineOfTheNight: [],
      bestTaster: [],
      mostDivisiveWine: [],
      scoringVersion: "legacy_v1",
      ...overrides,
    },
  };
}

function seenReport(wineOfTheNightWine?: WineAnswerKey): ReportData {
  return {
    kind: "seen",
    report: {
      bottleResults: [],
      wineOfTheNight: wineOfTheNightWine
        ? [
            {
              wine: wineOfTheNightWine,
              rank: 1,
              averageRating: 92,
              numRatings: 3,
              lowestRating: 88,
              highestRating: 95,
              ratingSpread: 7,
              participantRatings: [],
            },
          ]
        : [],
      mostDivisiveWine: [],
      totalRatings: 0,
      totalRaters: 0,
      totalBottles: 1,
    },
  };
}

function hostSession(overrides: Partial<HostSessionResponse["session"]> = {}): HostSessionResponse {
  return {
    session: {
      id: "internal-1",
      publicId: "pub-1",
      title: "Burgundy Villages at the Table",
      tastingDate: "2026-08-14",
      status: "revealed",
      joinCode: "MAROON-42",
      createdAt: "2026-08-01T10:00:00.000Z",
      hostGuestId: "guest-host",
      tastingMode: "full_blind",
      scoringVersion: "legacy_v1",
      ...overrides,
    },
    wines: [
      { id: "w1", bottleNumber: 1, anonymousCode: "Bottle 1", wineStyle: "red", tastingOrder: 1, revealedAt: null },
      { id: "w2", bottleNumber: 2, anonymousCode: "Bottle 2", wineStyle: "white", tastingOrder: 2, revealedAt: null },
    ],
    guests: [
      { id: "guest-host", displayName: "Alice", completedAt: "2026-08-14T20:00:00.000Z", readyToBeginAt: null },
      { id: "guest-2", displayName: "Ben", completedAt: "2026-08-14T20:05:00.000Z", readyToBeginAt: null },
    ],
    activeBottle: null,
    seenProgress: null,
    matchProgress: null,
  };
}

function guestSession(
  overrides: Partial<GuestSessionStateResponse["session"]> = {}
): GuestSessionStateResponse {
  return {
    guest: { id: "guest-2", displayName: "Ben", completedAt: "2026-08-14T20:05:00.000Z", isHost: false },
    session: {
      id: "internal-1",
      publicId: "pub-1",
      title: "Burgundy Villages at the Table",
      tastingDate: "2026-08-14",
      status: "revealed",
      tastingMode: "full_blind",
      scoringVersion: "legacy_v1",
      createdAt: "2026-08-01T10:00:00.000Z",
      participantCount: 2,
      ...overrides,
    },
    wines: [
      {
        id: "w1",
        bottleNumber: 1,
        anonymousCode: "Bottle 1",
        styleHint: "all_skins",
        contributorName: null,
        contributorStyleBucket: null,
        contributorStyleSequence: null,
        isOwnBottle: false,
      },
    ],
    guesses: [],
  };
}

function depsWith(overrides: Partial<ArchiveResolutionDeps> = {}): ArchiveResolutionDeps {
  return {
    getHostSession: async () => null,
    getGuestSessionState: async () => null,
    loadReport: async () => standardReport(),
    ...overrides,
  };
}

describe("resolveArchiveEntries — host references", () => {
  it("returns a ready entry for a valid host token on a revealed session", async () => {
    const deps = depsWith({
      getHostSession: async () => hostSession(),
      loadReport: async () => standardReport({ wineOfTheNight: [{ wine: wine(), averageRating: 94, numRatings: 3, lowestRating: 90, highestRating: 97, ratingSpread: 7, guesses: [], topTasters: [], scoringVersion: "legacy_v1" as const }] }),
    });

    const [result] = await resolveArchiveEntries(
      [{ publicId: "pub-1", role: "host", token: "host-token" }],
      deps
    );

    expect(result.status).toBe("ready");
    expect(result.entry?.role).toBe("host");
    expect(result.entry?.title).toBe("Burgundy Villages at the Table");
    expect(result.entry?.bottleCount).toBe(2);
    expect(result.entry?.participantCount).toBe(2);
    expect(result.entry?.wineOfTheNight).toEqual({
      bottleLabel: "Bottle 4",
      wineIdentity: "Domaine Example — Nuits-Saint-Georges 2021",
    });
  });

  it("excludes a session when the host token is rejected", async () => {
    const deps = depsWith({ getHostSession: async () => null });
    const [result] = await resolveArchiveEntries(
      [{ publicId: "pub-1", role: "host", token: "wrong-token" }],
      deps
    );
    expect(result.status).toBe("invalid");
    expect(result.entry).toBeUndefined();
  });

  it("excludes a session that is still in registration or collecting", async () => {
    const deps = depsWith({
      getHostSession: async () => hostSession({ status: "collecting" }),
    });
    const [result] = await resolveArchiveEntries(
      [{ publicId: "pub-1", role: "host", token: "host-token" }],
      deps
    );
    expect(result.status).toBe("not_revealed");
    expect(result.entry).toBeUndefined();
  });

  it("does not surface another host's session just because a publicId is supplied", async () => {
    // A host token is validated against the exact session it hashes to inside
    // get_host_session itself — this test documents that resolveHostItem
    // trusts that RPC's rejection (null) rather than the caller's publicId.
    const deps = depsWith({ getHostSession: async () => null });
    const [result] = await resolveArchiveEntries(
      [{ publicId: "someone-elses-session", role: "host", token: "not-my-token" }],
      deps
    );
    expect(result.status).toBe("invalid");
  });

  it("never includes a raw token anywhere in the resolved entry", async () => {
    const deps = depsWith({ getHostSession: async () => hostSession() });
    const [result] = await resolveArchiveEntries(
      [{ publicId: "pub-1", role: "host", token: "super-secret-host-token" }],
      deps
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("super-secret-host-token");
  });
});

describe("resolveArchiveEntries — participant references", () => {
  it("returns a ready entry for a valid guest token on a revealed session", async () => {
    const deps = depsWith({ getGuestSessionState: async () => guestSession() });
    const [result] = await resolveArchiveEntries(
      [{ publicId: "pub-1", role: "participant", token: "guest-token" }],
      deps
    );
    expect(result.status).toBe("ready");
    expect(result.entry?.role).toBe("participant");
    expect(result.entry?.participantCount).toBe(2);
  });

  it("excludes a session when the guest token is invalid", async () => {
    const deps = depsWith({ getGuestSessionState: async () => null });
    const [result] = await resolveArchiveEntries(
      [{ publicId: "pub-1", role: "participant", token: "bad-token" }],
      deps
    );
    expect(result.status).toBe("invalid");
  });

  it("excludes a session still in registration or collecting", async () => {
    const deps = depsWith({
      getGuestSessionState: async () => guestSession({ status: "collecting" }),
    });
    const [result] = await resolveArchiveEntries(
      [{ publicId: "pub-1", role: "participant", token: "guest-token" }],
      deps
    );
    expect(result.status).toBe("not_revealed");
  });

  it("treats a guest token that resolves to a different session as invalid, never trusting the client-labeled publicId", async () => {
    const deps = depsWith({
      getGuestSessionState: async () => guestSession({ publicId: "actually-a-different-session" }),
    });
    const [result] = await resolveArchiveEntries(
      [{ publicId: "pub-1", role: "participant", token: "someones-other-token" }],
      deps
    );
    expect(result.status).toBe("invalid");
  });

  it("shows No group rating recorded (null highlight) when there are no eligible ratings", async () => {
    const deps = depsWith({
      getGuestSessionState: async () => guestSession(),
      loadReport: async () => standardReport({ wineOfTheNight: [] }),
    });
    const [result] = await resolveArchiveEntries(
      [{ publicId: "pub-1", role: "participant", token: "guest-token" }],
      deps
    );
    expect(result.entry?.wineOfTheNight).toBeNull();
  });

  it("computes seen-tasting wine of the night without any blind accuracy", async () => {
    const deps = depsWith({
      getGuestSessionState: async () => guestSession({ tastingMode: "seen" }),
      loadReport: async () => seenReport(wine({ code: "Bottle 2" })),
    });
    const [result] = await resolveArchiveEntries(
      [{ publicId: "pub-1", role: "participant", token: "guest-token" }],
      deps
    );
    expect(result.entry?.wineOfTheNight?.bottleLabel).toBe("Bottle 2");
    expect(result.entry?.accuracyPercent).toBeNull();
  });
});

describe("resolveArchiveEntries — bounded, isolated batches", () => {
  it("resolves one bad reference without affecting the others", async () => {
    const deps = depsWith({
      getHostSession: async (publicId) => (publicId === "pub-good" ? hostSession({ publicId: "pub-good" }) : null),
    });
    const results = await resolveArchiveEntries(
      [
        { publicId: "pub-good", role: "host", token: "good-token" },
        { publicId: "pub-bad", role: "host", token: "bad-token" },
      ],
      deps
    );
    expect(results.map((r) => r.status)).toEqual(["ready", "invalid"]);
  });

  it("never resolves more than MAX_ARCHIVE_LOOKUP_ITEMS even if given more", async () => {
    let calls = 0;
    const deps = depsWith({
      getHostSession: async () => {
        calls += 1;
        return hostSession();
      },
    });
    const items = Array.from({ length: MAX_ARCHIVE_LOOKUP_ITEMS + 10 }, (_, i) => ({
      publicId: `pub-${i}`,
      role: "host" as const,
      token: "token",
    }));
    await resolveArchiveEntries(items, deps);
    expect(calls).toBe(MAX_ARCHIVE_LOOKUP_ITEMS);
  });
});

function readyItem(entry: Partial<ArchiveEntry> & Pick<ArchiveEntry, "publicId" | "role">): ArchiveLookupResultItem {
  return {
    publicId: entry.publicId,
    role: entry.role,
    status: "ready",
    entry: {
      title: "Session",
      tastingDate: "2026-08-01",
      createdAt: "2026-08-01T00:00:00.000Z",
      tastingMode: "full_blind",
      bottleCount: 4,
      participantCount: 4,
      wineOfTheNight: null,
      accuracyPercent: null,
      ...entry,
    } as ArchiveEntry,
  };
}

describe("selectDisplayEntries", () => {
  it("shows a session only once under Hosted by you when both host and participant references resolve", () => {
    const items: ArchiveLookupResultItem[] = [
      readyItem({ publicId: "pub-1", role: "participant" }),
      readyItem({ publicId: "pub-1", role: "host" }),
    ];
    const entries = selectDisplayEntries(items);
    expect(entries).toHaveLength(1);
    expect(entries[0].role).toBe("host");
  });

  it("orders sessions reverse-chronologically by tasting date, falling back to createdAt", () => {
    const items: ArchiveLookupResultItem[] = [
      readyItem({ publicId: "older-date", role: "host", tastingDate: "2026-01-01", createdAt: "2026-01-01T00:00:00.000Z" }),
      readyItem({ publicId: "newer-date", role: "host", tastingDate: "2026-06-01", createdAt: "2026-06-01T00:00:00.000Z" }),
      readyItem({ publicId: "same-date-earlier", role: "host", tastingDate: "2026-06-01", createdAt: "2026-06-01T05:00:00.000Z" }),
      readyItem({ publicId: "same-date-later", role: "host", tastingDate: "2026-06-01", createdAt: "2026-06-01T10:00:00.000Z" }),
    ];
    const entries = selectDisplayEntries(items);
    expect(entries.map((e) => e.publicId)).toEqual([
      "same-date-later",
      "same-date-earlier",
      "newer-date",
      "older-date",
    ]);
  });

  it("omits not_revealed and invalid items entirely", () => {
    const items: ArchiveLookupResultItem[] = [
      { publicId: "pub-1", role: "host", status: "not_revealed" },
      { publicId: "pub-2", role: "host", status: "invalid" },
      readyItem({ publicId: "pub-3", role: "host" }),
    ];
    expect(selectDisplayEntries(items).map((e) => e.publicId)).toEqual(["pub-3"]);
  });
});

describe("splitByRole / defaultArchiveTab", () => {
  it("splits entries into hosted and joined groups", () => {
    const entries = [
      readyItem({ publicId: "a", role: "host" }).entry!,
      readyItem({ publicId: "b", role: "participant" }).entry!,
    ];
    const { hosted, joined } = splitByRole(entries);
    expect(hosted.map((e) => e.publicId)).toEqual(["a"]);
    expect(joined.map((e) => e.publicId)).toEqual(["b"]);
  });

  it("defaults to hosted when it has entries", () => {
    expect(defaultArchiveTab([readyItem({ publicId: "a", role: "host" }).entry!])).toBe("hosted");
  });

  it("defaults to joined when hosted is empty", () => {
    expect(defaultArchiveTab([])).toBe("joined");
  });
});

describe("buildArchiveSummary", () => {
  it("computes completed count and bottle total from only the given entries", () => {
    const entries = [
      readyItem({ publicId: "a", role: "host", bottleCount: 6 }).entry!,
      readyItem({ publicId: "b", role: "host", bottleCount: 4 }).entry!,
    ];
    const summary = buildArchiveSummary(entries);
    expect(summary.completedCount).toBe(2);
    expect(summary.bottlesTasted).toBe(10);
  });

  it("omits accuracy entirely when no entry has scoring data", () => {
    const entries = [readyItem({ publicId: "a", role: "host", accuracyPercent: null }).entry!];
    expect(buildArchiveSummary(entries).averageAccuracyPercent).toBeNull();
  });

  it("averages accuracy only across entries that have it (seen-mode entries never contribute)", () => {
    const entries = [
      readyItem({ publicId: "a", role: "host", accuracyPercent: 80 }).entry!,
      readyItem({ publicId: "b", role: "host", accuracyPercent: 90 }).entry!,
      readyItem({ publicId: "c", role: "host", tastingMode: "seen", accuracyPercent: null }).entry!,
    ];
    expect(buildArchiveSummary(entries).averageAccuracyPercent).toBe(85);
  });
});

describe("staleReferences", () => {
  it("flags only invalid items for local cleanup, keeping not_revealed ones", () => {
    const items: ArchiveLookupResultItem[] = [
      { publicId: "a", role: "host", status: "invalid" },
      { publicId: "b", role: "host", status: "not_revealed" },
      readyItem({ publicId: "c", role: "host" }),
    ];
    expect(staleReferences(items)).toEqual([{ publicId: "a", role: "host" }]);
  });
});

describe("parseArchiveLookupRequest", () => {
  it("accepts a well-formed items array", () => {
    const parsed = parseArchiveLookupRequest({
      items: [{ publicId: "pub-1", role: "host", token: "abc" }],
    });
    expect(parsed).toEqual([{ publicId: "pub-1", role: "host", token: "abc" }]);
  });

  it("accepts an empty items array (no local references yet)", () => {
    expect(parseArchiveLookupRequest({ items: [] })).toEqual([]);
  });

  it("rejects a request over the maximum bound", () => {
    const items = Array.from({ length: MAX_ARCHIVE_LOOKUP_ITEMS + 1 }, () => ({
      publicId: "pub",
      role: "host",
      token: "t",
    }));
    expect(parseArchiveLookupRequest({ items })).toBeNull();
  });

  it("rejects a malformed role", () => {
    expect(
      parseArchiveLookupRequest({ items: [{ publicId: "pub-1", role: "admin", token: "t" }] })
    ).toBeNull();
  });

  it("rejects a missing token", () => {
    expect(
      parseArchiveLookupRequest({ items: [{ publicId: "pub-1", role: "host" }] })
    ).toBeNull();
  });

  it("rejects a non-object body", () => {
    expect(parseArchiveLookupRequest("not an object")).toBeNull();
    expect(parseArchiveLookupRequest(null)).toBeNull();
  });

  it("rejects a body whose items field isn't an array", () => {
    expect(parseArchiveLookupRequest({ items: "pub-1" })).toBeNull();
  });
});

function accountRecord(
  overrides: Partial<AccountTastingRecordRow> = {}
): AccountTastingRecordRow {
  return {
    session_id: "internal-1",
    role: "host",
    participant_id: null,
    claimed_at: "2026-08-14T20:10:00.000Z",
    claim_source: "automatic",
    ...overrides,
  };
}

function sessionSummary(overrides: Partial<AccountSessionSummary> = {}): AccountSessionSummary {
  return {
    id: "internal-1",
    publicId: "pub-1",
    title: "Burgundy Villages at the Table",
    tastingDate: "2026-08-14",
    status: "revealed",
    tastingMode: "full_blind",
    scoringVersion: "legacy_v1",
    createdAt: "2026-08-01T10:00:00.000Z",
    bottleCount: 2,
    participantCount: 2,
    ...overrides,
  };
}

function accountDepsWith(
  overrides: Partial<AccountArchiveResolutionDeps> = {}
): AccountArchiveResolutionDeps {
  return {
    getSessionSummary: async () => sessionSummary(),
    loadReport: async () => standardReport(),
    ...overrides,
  };
}

describe("resolveAccountEntries", () => {
  it("builds an entry for a revealed linked session", async () => {
    const deps = accountDepsWith({
      loadReport: async () =>
        standardReport({
          wineOfTheNight: [
            { wine: wine(), averageRating: 94, numRatings: 3, lowestRating: 90, highestRating: 97, ratingSpread: 7, guesses: [], topTasters: [], scoringVersion: "legacy_v1" as const },
          ],
        }),
    });
    const [entry] = await resolveAccountEntries([accountRecord()], deps);
    expect(entry.role).toBe("host");
    expect(entry.title).toBe("Burgundy Villages at the Table");
    expect(entry.wineOfTheNight?.bottleLabel).toBe("Bottle 4");
  });

  it("excludes a linked session that no longer exists", async () => {
    const deps = accountDepsWith({ getSessionSummary: async () => null });
    const entries = await resolveAccountEntries([accountRecord()], deps);
    expect(entries).toHaveLength(0);
  });

  it("excludes a linked session that is not currently revealed", async () => {
    const deps = accountDepsWith({
      getSessionSummary: async () => sessionSummary({ status: "collecting" }),
    });
    const entries = await resolveAccountEntries([accountRecord()], deps);
    expect(entries).toHaveLength(0);
  });

  it("never computes accuracy for a host-role record", async () => {
    const deps = accountDepsWith({
      loadReport: async () =>
        standardReport({
          tasterResults: [
            {
              guestId: "guest-host",
              guestName: "Alice",
              rank: 1,
              totalPoints: 300,
              totalPossible: 360,
              corePoints: 250,
              corePossible: 300,
              bonusPoints: 50,
              bonusPossible: 60,
              overallAccuracyPercent: 83.3,
              coreAccuracyPercent: 83.3,
              exactCoreMatches: 10,
              submittedGuessCount: 3,
              averageRatingGiven: 90,
            },
          ],
        }),
    });
    const [entry] = await resolveAccountEntries(
      [accountRecord({ role: "host", participant_id: null })],
      deps
    );
    expect(entry.accuracyPercent).toBeNull();
  });

  it("computes accuracy for a participant-role record from its own participant_id", async () => {
    const deps = accountDepsWith({
      loadReport: async () =>
        standardReport({
          tasterResults: [
            {
              guestId: "guest-2",
              guestName: "Ben",
              rank: 2,
              totalPoints: 250,
              totalPossible: 360,
              corePoints: 200,
              corePossible: 300,
              bonusPoints: 50,
              bonusPossible: 60,
              overallAccuracyPercent: 69.4,
              coreAccuracyPercent: 66.7,
              exactCoreMatches: 7,
              submittedGuessCount: 3,
              averageRatingGiven: 88,
            },
          ],
        }),
    });
    const [entry] = await resolveAccountEntries(
      [accountRecord({ role: "participant", participant_id: "guest-2" })],
      deps
    );
    expect(entry.accuracyPercent).toBe(69.4);
  });

  it("dedupes a session linked as both host and participant, preferring host", async () => {
    const deps = accountDepsWith();
    const entries = await resolveAccountEntries(
      [
        accountRecord({ role: "participant", participant_id: "guest-2" }),
        accountRecord({ role: "host", participant_id: null }),
      ],
      deps
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].role).toBe("host");
  });

  it("sorts by tasting date descending, falling back to createdAt", async () => {
    const summaries: Record<string, AccountSessionSummary> = {
      "session-a": sessionSummary({ id: "session-a", publicId: "pub-a", tastingDate: "2026-01-01", createdAt: "2026-01-01T00:00:00.000Z" }),
      "session-b": sessionSummary({ id: "session-b", publicId: "pub-b", tastingDate: "2026-06-01", createdAt: "2026-06-01T00:00:00.000Z" }),
    };
    const deps = accountDepsWith({
      getSessionSummary: async (sessionId) => summaries[sessionId] ?? null,
    });
    const entries = await resolveAccountEntries(
      [
        accountRecord({ session_id: "session-a" }),
        accountRecord({ session_id: "session-b" }),
      ],
      deps
    );
    expect(entries.map((e) => e.publicId)).toEqual(["pub-b", "pub-a"]);
  });

  it("resolves one missing session without affecting the others", async () => {
    const summaries: Record<string, AccountSessionSummary> = {
      "session-good": sessionSummary({ id: "session-good", publicId: "pub-good" }),
    };
    const deps = accountDepsWith({
      getSessionSummary: async (sessionId) => summaries[sessionId] ?? null,
    });
    const entries = await resolveAccountEntries(
      [accountRecord({ session_id: "session-good" }), accountRecord({ session_id: "session-missing" })],
      deps
    );
    expect(entries.map((e) => e.publicId)).toEqual(["pub-good"]);
  });
});

describe("accountLinkedPublicIds", () => {
  it("returns the set of publicIds already present in the account archive", () => {
    const entry: ArchiveEntry = {
      publicId: "pub-1",
      role: "host",
      title: "t",
      tastingDate: "2026-01-01",
      createdAt: "2026-01-01T00:00:00.000Z",
      tastingMode: "full_blind",
      bottleCount: 1,
      participantCount: 1,
      wineOfTheNight: null,
      accuracyPercent: null,
    };
    const linked = accountLinkedPublicIds([entry]);
    expect(linked.has("pub-1")).toBe(true);
    expect(linked.has("pub-2")).toBe(false);
  });
});

describe("parseClaimRequest", () => {
  it("accepts a well-formed claim request", () => {
    expect(
      parseClaimRequest({ publicId: "pub-1", role: "host", token: "abc", claimSource: "browser_claim" })
    ).toEqual({ publicId: "pub-1", role: "host", token: "abc", claimSource: "browser_claim" });
  });

  it("accepts claimSource automatic", () => {
    expect(
      parseClaimRequest({ publicId: "pub-1", role: "participant", token: "abc", claimSource: "automatic" })
    ).not.toBeNull();
  });

  it("rejects an invalid role", () => {
    expect(
      parseClaimRequest({ publicId: "pub-1", role: "admin", token: "abc", claimSource: "automatic" })
    ).toBeNull();
  });

  it("rejects an invalid claimSource", () => {
    expect(
      parseClaimRequest({ publicId: "pub-1", role: "host", token: "abc", claimSource: "manual" })
    ).toBeNull();
  });

  it("rejects a missing token", () => {
    expect(
      parseClaimRequest({ publicId: "pub-1", role: "host", claimSource: "automatic" })
    ).toBeNull();
  });

  it("rejects a missing publicId", () => {
    expect(
      parseClaimRequest({ role: "host", token: "abc", claimSource: "automatic" })
    ).toBeNull();
  });

  it("rejects a non-object body", () => {
    expect(parseClaimRequest("nope")).toBeNull();
    expect(parseClaimRequest(null)).toBeNull();
  });
});
