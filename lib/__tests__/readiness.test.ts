import { describe, expect, it } from "vitest";
import {
  EVERYONE_READY_MESSAGE,
  NO_ELIGIBLE_PARTICIPANTS_MESSAGE,
  NOT_READY_POPOVER_TITLE,
  PARTICIPANT_READY_ANNOUNCEMENT,
  formatReadinessAccessibleLabel,
  formatReadinessCountLine,
  formatReadinessUpdateAnnouncement,
  summarizeReadiness,
} from "@/lib/readiness";

describe("formatReadinessCountLine", () => {
  it("formats the exact required grammar for every given example", () => {
    expect(formatReadinessCountLine(0, 8)).toBe("0 of 8 participants are ready");
    expect(formatReadinessCountLine(1, 8)).toBe("1 of 8 participant is ready");
    expect(formatReadinessCountLine(6, 8)).toBe("6 of 8 participants are ready");
    expect(formatReadinessCountLine(8, 8)).toBe("8 of 8 participants are ready");
  });

  it("bases singular/plural agreement on readyCount, not eligibleCount", () => {
    expect(formatReadinessCountLine(1, 1)).toBe("1 of 1 participant is ready");
  });
});

describe("formatReadinessAccessibleLabel", () => {
  it("includes the aggregate state in the accessible label", () => {
    expect(formatReadinessAccessibleLabel(6, 8)).toBe(
      "View participants not ready. 6 of 8 participants are ready."
    );
  });
});

describe("formatReadinessUpdateAnnouncement", () => {
  it("formats the suggested host announcement copy", () => {
    expect(formatReadinessUpdateAnnouncement(7, 8)).toBe(
      "Readiness updated: 7 of 8 participants are ready."
    );
  });
});

describe("NO_ELIGIBLE_PARTICIPANTS_MESSAGE", () => {
  it("reuses the exact existing zero-eligible copy, never inventing a new string", () => {
    expect(NO_ELIGIBLE_PARTICIPANTS_MESSAGE).toBe("No eligible participants yet.");
  });
});

describe("NOT_READY_POPOVER_TITLE / EVERYONE_READY_MESSAGE / PARTICIPANT_READY_ANNOUNCEMENT", () => {
  it("match the required exact copy", () => {
    expect(NOT_READY_POPOVER_TITLE).toBe("Not ready yet");
    expect(EVERYONE_READY_MESSAGE).toBe("Everyone is ready to begin.");
    expect(PARTICIPANT_READY_ANNOUNCEMENT).toBe("You are ready to begin.");
  });
});

describe("summarizeReadiness", () => {
  it("counts ready/eligible and lists only not-ready display names", () => {
    const result = summarizeReadiness([
      { displayName: "Daniel", readyToBeginAt: null },
      { displayName: "Mia", readyToBeginAt: "2026-08-14T10:00:00Z" },
      { displayName: "Noah", readyToBeginAt: null },
    ]);
    expect(result).toEqual({
      readyCount: 1,
      eligibleCount: 3,
      notReadyNames: ["Daniel", "Noah"],
    });
  });

  it("never includes a ready participant's name in notReadyNames", () => {
    const result = summarizeReadiness([
      { displayName: "Ready One", readyToBeginAt: "2026-08-14T10:00:00Z" },
    ]);
    expect(result.notReadyNames).toEqual([]);
  });

  it("returns a safe zero-eligible state for an empty session", () => {
    const result = summarizeReadiness([]);
    expect(result).toEqual({ readyCount: 0, eligibleCount: 0, notReadyNames: [] });
  });

  it("counts the host once, exactly like any other guest row", () => {
    // The host has no separate representation — it's just one guests row,
    // so a caller passing it in the array is enough; no special-case field.
    const result = summarizeReadiness([
      { displayName: "Host Person", readyToBeginAt: "2026-08-14T10:00:00Z" },
      { displayName: "Guest Person", readyToBeginAt: null },
    ]);
    expect(result.readyCount).toBe(1);
    expect(result.eligibleCount).toBe(2);
  });

  it("preserves accents and Unicode characters in names", () => {
    const result = summarizeReadiness([{ displayName: "Renée Château", readyToBeginAt: null }]);
    expect(result.notReadyNames).toEqual(["Renée Château"]);
  });
});
