import { describe, expect, it } from "vitest";
import {
  buildLedgerRows,
  buildWineObservationsForSession,
  computeAtAGlance,
  computeBlindPalate,
  computeRecentEvenings,
  computeWineRecord,
  DEFAULT_LEDGER_FILTERS,
  extractBlindObservations,
  filterLedgerRows,
  isValidLedgerSort,
  isValidTastingScope,
  normalizeWineIdentityKey,
  parseLedgerQuery,
  paginateLedgerRows,
  resolveSessionLinks,
  SessionLink,
  SessionMeta,
  sortLedgerRows,
  WineObservation,
} from "@/lib/profile";
import { ReportData } from "@/lib/supabase/reportData";
import { AccountTastingRecordRow } from "@/lib/supabase/types";
import { ScoredGuess, SeenBottleResult, TastingReport, WineAnswerKey } from "@/types/tasting";

function wine(overrides: Partial<WineAnswerKey> = {}): WineAnswerKey {
  return {
    id: "wine-1",
    code: "Bottle 1",
    country: "France",
    region: "Burgundy",
    grapeBlendMode: "single",
    grapeBlend: "Pinot Noir",
    producer: "Domaine Example",
    wineName: "Nuits-Saint-Georges",
    vintage: "2021",
    wineStyle: "red",
    tastingOrder: 1,
    ...overrides,
  };
}

function scoredGuess(overrides: Partial<ScoredGuess> = {}, correctFields: string[] = [
  "country",
  "region",
  "grapeBlend",
  "vintage",
  "producer",
  "wineName",
]): ScoredGuess {
  const fieldDefs: { field: ScoredGuess["fieldScores"][number]["field"]; category: "core" | "bonus"; points: number }[] = [
    { field: "country", category: "core", points: 20 },
    { field: "region", category: "core", points: 30 },
    { field: "grapeBlend", category: "core", points: 30 },
    { field: "vintage", category: "core", points: 20 },
    { field: "producer", category: "bonus", points: 10 },
    { field: "wineName", category: "bonus", points: 10 },
  ];
  const fieldScores = fieldDefs.map((f) => ({
    field: f.field,
    category: f.category,
    guessedValue: "x",
    answerValue: "x",
    correct: correctFields.includes(f.field),
    points: correctFields.includes(f.field) ? f.points : 0,
    pointsAvailable: f.points,
  }));
  const corePoints = fieldScores.filter((f) => f.category === "core" && f.correct).reduce((s, f) => s + f.points, 0);
  const bonusPoints = fieldScores.filter((f) => f.category === "bonus" && f.correct).reduce((s, f) => s + f.points, 0);
  return {
    guestId: "guest-1",
    guestName: "Alice",
    wineId: "wine-1",
    fieldScores,
    corePoints,
    bonusPoints,
    totalPoints: corePoints + bonusPoints,
    coreAccuracyPercent: (corePoints / 100) * 100,
    overallAccuracyPercent: ((corePoints + bonusPoints) / 120) * 100,
    rating: 88,
    confidence: "medium",
    ...overrides,
  };
}

function standardReport(wineResults: TastingReport["wineResults"]): ReportData {
  return {
    kind: "standard",
    report: { wineResults, tasterResults: [], wineOfTheNight: [], bestTaster: [], mostDivisiveWine: [] },
  };
}

function seenReport(bottleResults: SeenBottleResult[]): ReportData {
  return {
    kind: "seen",
    report: { bottleResults, wineOfTheNight: [], mostDivisiveWine: [], totalRatings: 0, totalRaters: 0, totalBottles: bottleResults.length },
  };
}

function sessionMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: "session-1",
    publicId: "pub-1",
    title: "Friday Night",
    tastingDate: "2026-01-10",
    createdAt: "2026-01-10T18:00:00Z",
    tastingMode: "full_blind",
    bottleCount: 1,
    participantCount: 2,
    ...overrides,
  };
}

function observation(overrides: Partial<WineObservation> = {}): WineObservation {
  return {
    sessionId: "session-1",
    publicId: "pub-1",
    sessionTitle: "Friday Night",
    tastingDate: "2026-01-10",
    sessionCreatedAt: "2026-01-10T18:00:00Z",
    tastingMode: "full_blind",
    role: "participant",
    wine: wine(),
    identityKey: normalizeWineIdentityKey(wine()),
    personalRating: 88,
    groupAverageRating: 85,
    groupNumRatings: 3,
    scoredGuess: scoredGuess(),
    contributedByYou: false,
    ...overrides,
  };
}

function accountRecord(overrides: Partial<AccountTastingRecordRow> = {}): AccountTastingRecordRow {
  return {
    session_id: "session-1",
    role: "participant",
    participant_id: "guest-1",
    claimed_at: "2026-01-10T18:00:00Z",
    claim_source: "automatic",
    ...overrides,
  };
}

describe("resolveSessionLinks", () => {
  it("resolves a participant-only link using the participant's own guest id", () => {
    const links = resolveSessionLinks([accountRecord()], new Map());
    expect(links).toEqual<SessionLink[]>([{ sessionId: "session-1", role: "participant", engagementGuestId: "guest-1" }]);
  });

  it("resolves a host-only link using the session's host_guest_id", () => {
    const links = resolveSessionLinks(
      [accountRecord({ role: "host", participant_id: null })],
      new Map([["session-1", "host-guest-1"]])
    );
    expect(links).toEqual<SessionLink[]>([{ sessionId: "session-1", role: "host", engagementGuestId: "host-guest-1" }]);
  });

  it("dedupes a session with both host and participant links into one host_and_participant entry, preferring the participant guest id", () => {
    const links = resolveSessionLinks(
      [
        accountRecord({ role: "host", participant_id: null, claimed_at: "2026-01-01T00:00:00Z" }),
        accountRecord({ role: "participant", participant_id: "guest-1", claimed_at: "2026-01-02T00:00:00Z" }),
      ],
      new Map([["session-1", "host-guest-1"]])
    );
    expect(links).toHaveLength(1);
    expect(links[0].role).toBe("host_and_participant");
    expect(links[0].engagementGuestId).toBe("guest-1");
  });

  it("picks the earliest-claimed participant identity when a user joined the same session twice", () => {
    const links = resolveSessionLinks(
      [
        accountRecord({ participant_id: "guest-b", claimed_at: "2026-01-05T00:00:00Z" }),
        accountRecord({ participant_id: "guest-a", claimed_at: "2026-01-01T00:00:00Z" }),
      ],
      new Map()
    );
    expect(links[0].engagementGuestId).toBe("guest-a");
  });

  it("returns a null engagementGuestId when a host link has no resolvable host_guest_id", () => {
    const links = resolveSessionLinks([accountRecord({ role: "host", participant_id: null })], new Map());
    expect(links[0].engagementGuestId).toBeNull();
  });
});

describe("normalizeWineIdentityKey", () => {
  it("collapses two wines that match on every field after normalization", () => {
    const a = normalizeWineIdentityKey(wine({ producer: "  Domaine Example ", wineName: "Nuits-Saint-Georges" }));
    const b = normalizeWineIdentityKey(wine({ producer: "domaine example", wineName: "Nuits Saint Georges" }));
    expect(a).toBe(b);
  });

  it("never merges wines that differ in only one field", () => {
    const a = normalizeWineIdentityKey(wine({ vintage: "2021" }));
    const b = normalizeWineIdentityKey(wine({ vintage: "2020" }));
    expect(a).not.toBe(b);
  });
});

describe("buildWineObservationsForSession", () => {
  const meta = sessionMeta();

  it("includes a standard-mode wine only when the engagement guest has a scored guess", () => {
    const wineWithGuess = wine({ id: "wine-1" });
    const wineWithoutGuess = wine({ id: "wine-2", producer: "Other" });
    const report = standardReport([
      { wine: wineWithGuess, averageRating: 85, numRatings: 2, lowestRating: 80, highestRating: 90, ratingSpread: 10, guesses: [scoredGuess({ guestId: "guest-1", wineId: "wine-1" })], topTasters: [] },
      { wine: wineWithoutGuess, averageRating: null, numRatings: 0, lowestRating: null, highestRating: null, ratingSpread: null, guesses: [], topTasters: [] },
    ]);

    const observations = buildWineObservationsForSession(meta, report, "guest-1", "participant");
    expect(observations).toHaveLength(1);
    expect(observations[0].wine.id).toBe("wine-1");
    expect(observations[0].scoredGuess).not.toBeNull();
  });

  it("marks contributedByYou only when the wine's contributorGuestId matches the engagement guest", () => {
    const mine = wine({ id: "wine-1", contributorGuestId: "guest-1" });
    const report = standardReport([
      { wine: mine, averageRating: 85, numRatings: 1, lowestRating: 85, highestRating: 85, ratingSpread: 0, guesses: [scoredGuess({ guestId: "guest-1", wineId: "wine-1" })], topTasters: [] },
    ]);
    const observations = buildWineObservationsForSession(meta, report, "guest-1", "participant");
    expect(observations[0].contributedByYou).toBe(true);
  });

  it("includes a seen-mode wine only when the engagement guest has a non-null rating", () => {
    const rated = wine({ id: "wine-1" });
    const unrated = wine({ id: "wine-2", producer: "Other" });
    const report = seenReport([
      { wine: rated, rank: 1, averageRating: 90, numRatings: 1, lowestRating: 90, highestRating: 90, ratingSpread: 0, participantRatings: [{ guestId: "guest-1", guestName: "Alice", rating: 90 }] },
      { wine: unrated, rank: 2, averageRating: null, numRatings: 0, lowestRating: null, highestRating: null, ratingSpread: null, participantRatings: [{ guestId: "guest-1", guestName: "Alice", rating: null }] },
    ]);

    const observations = buildWineObservationsForSession(sessionMeta({ tastingMode: "seen" }), report, "guest-1", "participant");
    expect(observations).toHaveLength(1);
    expect(observations[0].personalRating).toBe(90);
    expect(observations[0].scoredGuess).toBeNull();
  });
});

describe("computeAtAGlance", () => {
  it("does not treat missing ratings as zero in the average", () => {
    const metas = [sessionMeta()];
    const obs = [observation({ personalRating: 90 }), observation({ personalRating: null, wine: wine({ id: "wine-2" }) })];
    const result = computeAtAGlance(metas, obs);
    expect(result.ratingsSubmitted).toBe(1);
    expect(result.averagePersonalRating).toBe(90);
  });

  it("reports no ratings recorded as null, not zero, when nothing is rated", () => {
    const result = computeAtAGlance([], []);
    expect(result.averagePersonalRating).toBeNull();
  });

  it("counts unique wines by normalized identity, not by observation count", () => {
    const sameWineTwice = [observation(), observation({ sessionId: "session-2", publicId: "pub-2" })];
    const result = computeAtAGlance([sessionMeta(), sessionMeta({ sessionId: "session-2", publicId: "pub-2" })], sameWineTwice);
    expect(result.bottlesTasted).toBe(2);
    expect(result.uniqueWinesTasted).toBe(1);
  });

  it("falls back date range to the deduplicated session metas, not per-observation dates", () => {
    const metas = [sessionMeta({ tastingDate: "2026-01-01" }), sessionMeta({ sessionId: "s2", publicId: "p2", tastingDate: "2026-03-01" })];
    const result = computeAtAGlance(metas, []);
    expect(result.firstTastingDate).toBe("2026-01-01");
    expect(result.latestTastingDate).toBe("2026-03-01");
  });
});

describe("computeBlindPalate and scope independence", () => {
  it("computes core/overall accuracy from earned vs. possible points across submitted guesses", () => {
    const obs = [
      observation({ scoredGuess: scoredGuess({}, ["country", "region"]) }), // 50 core / 50 overall
      observation({ scoredGuess: scoredGuess({}, ["country", "region", "grapeBlend", "vintage", "producer", "wineName"]) }), // 100 core / 120 overall
    ];
    const result = computeBlindPalate(obs);
    expect(result.totalSubmittedCalls).toBe(2);
    expect(result.corePointsEarned).toBe(150);
    expect(result.corePointsPossible).toBe(200);
    expect(result.coreAccuracyPercent).toBe(75);
  });

  it("excludes bottles without a submitted guess (scoredGuess: null) from the denominator", () => {
    const obs = [observation({ scoredGuess: scoredGuess() }), observation({ scoredGuess: null })];
    const result = computeBlindPalate(obs);
    expect(result.totalSubmittedCalls).toBe(1);
  });

  it("shows an empty/insufficient-sample state below the minimum thresholds", () => {
    const obs = Array.from({ length: 9 }, () => observation({ scoredGuess: scoredGuess() }));
    const result = computeBlindPalate(obs);
    expect(result.totalSubmittedCalls).toBe(9);
    expect(result.strengths.hasSufficientSample).toBe(false);
    expect(result.strengths.strongestCore).toBeNull();
  });

  it("declares strengths once the 10-call and 5-per-category thresholds are met", () => {
    const obs = Array.from({ length: 10 }, () => observation({ scoredGuess: scoredGuess({}, ["country", "region"]) }));
    const result = computeBlindPalate(obs);
    expect(result.strengths.hasSufficientSample).toBe(true);
    expect(result.strengths.strongestCore?.field).toBe("country");
    expect(result.strengths.developingCore?.accuracyPercent).toBe(0);
  });

  it("never changes when the caller's scope-filtered observation set changes — only extractBlindObservations governs it", () => {
    const blindOnlyRun = [observation({ tastingMode: "full_blind" }), observation({ tastingMode: "seen", scoredGuess: null })];
    const includeSeenRun = extractBlindObservations(blindOnlyRun); // scope toggle never adds/removes blind observations
    expect(computeBlindPalate(extractBlindObservations(blindOnlyRun))).toEqual(computeBlindPalate(includeSeenRun));
  });

  it("extractBlindObservations always excludes seen-tasting observations", () => {
    const obs = [observation({ tastingMode: "seen", scoredGuess: null }), observation({ tastingMode: "course_reveal" })];
    expect(extractBlindObservations(obs)).toHaveLength(1);
    expect(extractBlindObservations(obs)[0].tastingMode).toBe("course_reveal");
  });
});

describe("computeWineRecord thresholds", () => {
  it("requires at least 3 rated observations before showing a highest-rated category", () => {
    const twoRated = [
      observation({ wine: wine({ country: "Italy" }), personalRating: 90 }),
      observation({ wine: wine({ country: "Italy" }), personalRating: 80, sessionId: "s2" }),
    ];
    expect(computeWineRecord(twoRated).highestRatedCountries).toHaveLength(0);

    const threeRated = [...twoRated, observation({ wine: wine({ country: "Italy" }), personalRating: 70, sessionId: "s3" })];
    expect(computeWineRecord(threeRated).highestRatedCountries).toHaveLength(1);
  });

  it("requires at least 2 observations before showing a familiar producer/wine", () => {
    const one = [observation({ wine: wine({ producer: "Solo Producer" }) })];
    expect(computeWineRecord(one).familiarProducers).toHaveLength(0);

    const two = [...one, observation({ wine: wine({ producer: "Solo Producer" }), sessionId: "s2" })];
    expect(computeWineRecord(two).familiarProducers).toHaveLength(1);
  });

  it("excludes unrated wines from standout bottles", () => {
    const obs = [observation({ personalRating: null })];
    expect(computeWineRecord(obs).standoutBottles).toHaveLength(0);
  });

  it("requires at least two distinct sessions before a wine counts as most revisited", () => {
    const sameSessionTwice = [
      observation({ sessionId: "s1", wine: wine({ id: "a" }) }),
    ];
    expect(computeWineRecord(sameSessionTwice).mostRevisited).toHaveLength(0);

    const twoSessions = [
      observation({ sessionId: "s1" }),
      observation({ sessionId: "s2" }),
    ];
    expect(computeWineRecord(twoSessions).mostRevisited).toHaveLength(1);
    expect(computeWineRecord(twoSessions).mostRevisited[0].occasions).toBe(2);
  });

  it("uses observation count, not unique-wine count, for most-explored rankings", () => {
    const obs = [
      observation({ wine: wine({ country: "France", id: "a" }) }),
      observation({ wine: wine({ country: "France", id: "b" }), sessionId: "s2" }),
    ];
    expect(computeWineRecord(obs).mostExploredCountries[0]).toEqual({ label: "France", count: 2 });
  });
});

describe("computeRecentEvenings", () => {
  it("sorts by tasting date descending and caps at 5", () => {
    const metas = Array.from({ length: 6 }, (_, i) =>
      sessionMeta({ sessionId: `s${i}`, publicId: `p${i}`, tastingDate: `2026-01-0${i + 1}` })
    );
    const result = computeRecentEvenings(metas, new Map());
    expect(result).toHaveLength(5);
    expect(result[0].publicId).toBe("p5");
  });

  it("reflects the resolved combined role per session", () => {
    const metas = [sessionMeta()];
    const roles = new Map([["session-1", "host_and_participant" as const]]);
    expect(computeRecentEvenings(metas, roles)[0].role).toBe("host_and_participant");
  });
});

describe("ledger filtering, sorting, and pagination", () => {
  const rows = buildLedgerRows([
    observation({ wine: wine({ country: "France", wineStyle: "red" }), personalRating: 90, tastingDate: "2026-02-01" }),
    observation({
      sessionId: "s2",
      wine: wine({ id: "w2", country: "Italy", wineStyle: "white", producer: "Other House" }),
      personalRating: 70,
      tastingDate: "2026-01-01",
      contributedByYou: true,
    }),
  ]);

  it("filters by country", () => {
    expect(filterLedgerRows(rows, { ...DEFAULT_LEDGER_FILTERS, country: "Italy" })).toHaveLength(1);
  });

  it("filters by wine style", () => {
    expect(filterLedgerRows(rows, { ...DEFAULT_LEDGER_FILTERS, wineStyle: "red" })).toHaveLength(1);
  });

  it("filters by minimum rating", () => {
    expect(filterLedgerRows(rows, { ...DEFAULT_LEDGER_FILTERS, minRating: 80 })).toHaveLength(1);
  });

  it("filters by contributed-by-you", () => {
    expect(filterLedgerRows(rows, { ...DEFAULT_LEDGER_FILTERS, contributedByYou: true })).toHaveLength(1);
  });

  it("searches across producer, wine name, region, country, grape, and session title", () => {
    expect(filterLedgerRows(rows, { ...DEFAULT_LEDGER_FILTERS, search: "italy" })).toHaveLength(1);
    expect(filterLedgerRows(rows, { ...DEFAULT_LEDGER_FILTERS, search: "nonexistent" })).toHaveLength(0);
  });

  it("sorts by highest and lowest personal rating", () => {
    expect(sortLedgerRows(rows, "rating_desc")[0].personalRating).toBe(90);
    expect(sortLedgerRows(rows, "rating_asc")[0].personalRating).toBe(70);
  });

  it("sorts by most recent tasting date by default", () => {
    expect(sortLedgerRows(rows, "recent")[0].tastingDate).toBe("2026-02-01");
  });

  it("paginates and bounds an out-of-range page to the last page", () => {
    const page = paginateLedgerRows(rows, 99, 1);
    expect(page.page).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.rows).toHaveLength(1);
  });
});

describe("parseLedgerQuery", () => {
  it("falls back to safe defaults for missing/invalid parameters", () => {
    const parsed = parseLedgerQuery(new URLSearchParams());
    expect(parsed.scope).toBe("blind_only");
    expect(parsed.sort).toBe("recent");
    expect(parsed.page).toBe(1);
    expect(parsed.filters.minRating).toBe("all");
  });

  it("rejects an out-of-range minRating rather than trusting it", () => {
    const parsed = parseLedgerQuery(new URLSearchParams("minRating=9999"));
    expect(parsed.filters.minRating).toBe("all");
  });

  it("accepts valid scope, sort, and minRating values", () => {
    const parsed = parseLedgerQuery(new URLSearchParams("scope=include_seen&sort=rating_desc&minRating=90&page=2"));
    expect(parsed.scope).toBe("include_seen");
    expect(parsed.sort).toBe("rating_desc");
    expect(parsed.filters.minRating).toBe(90);
    expect(parsed.page).toBe(2);
  });
});

describe("scope/sort validators", () => {
  it("validates tasting scope values", () => {
    expect(isValidTastingScope("blind_only")).toBe(true);
    expect(isValidTastingScope("include_seen")).toBe(true);
    expect(isValidTastingScope("everything")).toBe(false);
    expect(isValidTastingScope(null)).toBe(false);
  });

  it("validates ledger sort values", () => {
    expect(isValidLedgerSort("recent")).toBe(true);
    expect(isValidLedgerSort("bogus")).toBe(false);
  });
});
