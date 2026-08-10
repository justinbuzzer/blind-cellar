import { describe, expect, it } from "vitest";
import {
  HostCurrentTastingInput,
  resolveHostCurrentTastingState,
} from "@/lib/hostCurrentTasting";
import { HostActiveBottleDTO, HostBottleDTO, HostSeenProgressDTO } from "@/lib/supabase/types";

function makeWine(overrides: Partial<HostBottleDTO> = {}): HostBottleDTO {
  return {
    id: "wine-1",
    bottleNumber: 1,
    anonymousCode: "Bottle 1",
    wineStyle: "red",
    tastingOrder: 1,
    revealedAt: null,
    contributorName: "Alice",
    ...overrides,
  };
}

function makeActiveBottle(overrides: Partial<HostActiveBottleDTO> = {}): HostActiveBottleDTO {
  return {
    id: "wine-2",
    bottleNumber: 2,
    anonymousCode: "Bottle 2",
    position: 2,
    totalBottles: 4,
    submittedCount: 3,
    totalParticipants: 5,
    ...overrides,
  };
}

function makeSeenProgress(overrides: Partial<HostSeenProgressDTO> = {}): HostSeenProgressDTO {
  return {
    ratersCount: 4,
    totalParticipants: 5,
    ratingsSubmitted: 12,
    totalPossibleRatings: 20,
    ...overrides,
  };
}

function makeInput(overrides: Partial<HostCurrentTastingInput> = {}): HostCurrentTastingInput {
  return {
    tastingMode: "full_blind",
    status: "collecting",
    wines: [makeWine()],
    completedCount: 3,
    eligibleCount: 5,
    activeBottle: null,
    seenProgress: null,
    ...overrides,
  };
}

describe("resolveHostCurrentTastingState — full_blind", () => {
  it("resolves the lowest-numbered unrevealed bottle with session-wide submitted/eligible counts", () => {
    const state = resolveHostCurrentTastingState(
      makeInput({
        wines: [
          makeWine({ id: "w3", bottleNumber: 3, revealedAt: null }),
          makeWine({ id: "w1", bottleNumber: 1, revealedAt: null }),
          makeWine({ id: "w2", bottleNumber: 2, revealedAt: "2026-01-01T00:00:00Z" }),
        ],
        completedCount: 6,
        eligibleCount: 8,
      })
    );
    expect(state.kind).toBe("awaiting_responses");
    if (state.kind !== "awaiting_responses") throw new Error("unreachable");
    expect(state.currentBottle?.label).toBe("Bottle 1");
    expect(state.progress).toEqual({ completedCount: 6, eligibleCount: 8, noun: "submitted" });
    expect(state.primaryAction).toEqual({
      type: "reveal_results",
      label: "Reveal results",
      wineId: "w1",
    });
  });

  it("never counts a draft/autosaved guess — completedCount is passed through unchanged from the caller's session-wide guests.completedAt count", () => {
    const state = resolveHostCurrentTastingState(makeInput({ completedCount: 0, eligibleCount: 5 }));
    if (state.kind !== "awaiting_responses") throw new Error("unreachable");
    expect(state.progress.completedCount).toBe(0);
  });

  it("marks allComplete once completedCount reaches eligibleCount", () => {
    const state = resolveHostCurrentTastingState(makeInput({ completedCount: 5, eligibleCount: 5 }));
    if (state.kind !== "awaiting_responses") throw new Error("unreachable");
    expect(state.allComplete).toBe(true);
  });

  it("does not mark allComplete when there are zero eligible participants", () => {
    const state = resolveHostCurrentTastingState(makeInput({ completedCount: 0, eligibleCount: 0 }));
    if (state.kind !== "awaiting_responses") throw new Error("unreachable");
    expect(state.allComplete).toBe(false);
    expect(state.progress.eligibleCount).toBe(0);
  });

  it("resolves no_eligible_bottles when zero bottles are registered", () => {
    const state = resolveHostCurrentTastingState(makeInput({ wines: [] }));
    expect(state).toEqual({ kind: "no_eligible_bottles" });
  });

  it("falls back to complete if every bottle is somehow already revealed while still collecting", () => {
    const state = resolveHostCurrentTastingState(
      makeInput({ wines: [makeWine({ revealedAt: "2026-01-01T00:00:00Z" })] })
    );
    expect(state.kind).toBe("complete");
  });
});

describe("resolveHostCurrentTastingState — course_reveal", () => {
  it("uses the server-computed activeBottle as the current bottle", () => {
    const state = resolveHostCurrentTastingState(
      makeInput({
        tastingMode: "course_reveal",
        wines: [makeWine()],
        activeBottle: makeActiveBottle({ anonymousCode: "Bottle 2", position: 2, submittedCount: 3, totalParticipants: 5 }),
      })
    );
    if (state.kind !== "awaiting_responses") throw new Error("unreachable");
    expect(state.currentBottle).toEqual({ label: "Bottle 2", courseLabel: "Course 2" });
    expect(state.progress).toEqual({ completedCount: 3, eligibleCount: 5, noun: "submitted" });
    expect(state.primaryAction.wineId).toBe("wine-2");
  });

  it("never surfaces a future/unrevealed course bottle's identity, count, or state", () => {
    const state = resolveHostCurrentTastingState(
      makeInput({
        tastingMode: "course_reveal",
        wines: [
          makeWine({ id: "w1", bottleNumber: 1, revealedAt: "2026-01-01T00:00:00Z" }),
          makeWine({ id: "w2", bottleNumber: 2, revealedAt: null }),
          makeWine({ id: "w3", bottleNumber: 3, revealedAt: null }),
        ],
        activeBottle: makeActiveBottle({ id: "w2", anonymousCode: "Bottle 2" }),
      })
    );
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("w3");
    expect(serialized).not.toContain("Bottle 3");
  });

  it("shows the most recently revealed bottle with a view_results action when no bottle is currently active", () => {
    const state = resolveHostCurrentTastingState(
      makeInput({
        tastingMode: "course_reveal",
        wines: [
          makeWine({ id: "w1", bottleNumber: 1, anonymousCode: "Bottle 1", revealedAt: "2026-01-01T00:00:00Z" }),
          makeWine({ id: "w2", bottleNumber: 2, anonymousCode: "Bottle 2", revealedAt: "2026-01-02T00:00:00Z" }),
        ],
        activeBottle: null,
      })
    );
    expect(state.kind).toBe("revealed");
    if (state.kind !== "revealed") throw new Error("unreachable");
    expect(state.currentBottle.label).toBe("Bottle 2");
    expect(state.primaryAction).toEqual({
      type: "view_results",
      label: "View results",
      wineId: "w2",
    });
  });

  it("resolves no_eligible_bottles when there is no active bottle and nothing has ever been revealed", () => {
    const state = resolveHostCurrentTastingState(
      makeInput({ tastingMode: "course_reveal", wines: [makeWine()], activeBottle: null })
    );
    expect(state).toEqual({ kind: "no_eligible_bottles" });
  });
});

describe("resolveHostCurrentTastingState — seen", () => {
  it("uses session-wide rating progress with no fabricated current bottle", () => {
    const state = resolveHostCurrentTastingState(
      makeInput({
        tastingMode: "seen",
        wines: [makeWine()],
        seenProgress: makeSeenProgress({ ratingsSubmitted: 12, totalPossibleRatings: 20 }),
      })
    );
    if (state.kind !== "awaiting_responses") throw new Error("unreachable");
    expect(state.currentBottle).toBeUndefined();
    expect(state.progress).toEqual({ completedCount: 12, eligibleCount: 20, noun: "rated" });
    expect(state.primaryAction).toEqual({
      type: "end_seen_tasting",
      label: "End tasting and reveal results",
    });
  });

  it("marks allComplete once every possible rating has been submitted", () => {
    const state = resolveHostCurrentTastingState(
      makeInput({
        tastingMode: "seen",
        wines: [makeWine()],
        seenProgress: makeSeenProgress({ ratingsSubmitted: 20, totalPossibleRatings: 20 }),
      })
    );
    if (state.kind !== "awaiting_responses") throw new Error("unreachable");
    expect(state.allComplete).toBe(true);
  });

  it("resolves no_eligible_bottles when zero bottles are registered", () => {
    const state = resolveHostCurrentTastingState(
      makeInput({ tastingMode: "seen", wines: [], seenProgress: makeSeenProgress() })
    );
    expect(state).toEqual({ kind: "no_eligible_bottles" });
  });
});

describe("resolveHostCurrentTastingState — completion", () => {
  it("resolves complete with a final-leaderboard primary and recap secondary for full_blind/course_reveal", () => {
    const state = resolveHostCurrentTastingState(makeInput({ status: "revealed" }));
    expect(state).toEqual({
      kind: "complete",
      primaryAction: { type: "view_final_leaderboard", label: "View final leaderboard" },
      secondaryAction: { type: "view_tasting_recap", label: "View tasting recap" },
    });
  });

  it("resolves complete with only a view_results action for seen (no leaderboard/recap)", () => {
    const state = resolveHostCurrentTastingState(makeInput({ tastingMode: "seen", status: "revealed" }));
    expect(state).toEqual({
      kind: "complete",
      primaryAction: { type: "view_results", label: "View shared results" },
    });
  });
});

describe("resolveHostCurrentTastingState — privacy", () => {
  it("never includes a participant display name anywhere in the resolved state", () => {
    const state = resolveHostCurrentTastingState(
      makeInput({
        tastingMode: "course_reveal",
        wines: [makeWine({ contributorName: "Top Secret Name" })],
        activeBottle: makeActiveBottle(),
      })
    );
    expect(JSON.stringify(state)).not.toContain("Top Secret Name");
  });
});
