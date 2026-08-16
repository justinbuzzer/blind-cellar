import { describe, expect, it } from "vitest";
import {
  formatCourseBottleRowLabel,
  formatReleaseBottleAriaLabel,
  formatReleaseBottleConfirmTitle,
  isCourseBottleReleasable,
} from "@/lib/courseRelease";

describe("isCourseBottleReleasable", () => {
  it("is releasable when unrevealed and no bottle is currently active", () => {
    expect(isCourseBottleReleasable({ revealedAt: null }, null)).toBe(true);
  });

  it("is not releasable while another bottle is active", () => {
    expect(isCourseBottleReleasable({ revealedAt: null }, "wine-2")).toBe(false);
  });

  it("is not releasable once already revealed, even with no active bottle", () => {
    expect(isCourseBottleReleasable({ revealedAt: "2026-01-01T00:00:00Z" }, null)).toBe(false);
  });

  it("is not releasable when it is itself the active bottle (shown as Current bottle instead)", () => {
    // The active bottle's own id is passed as activeWineId by the caller —
    // this function only decides "any other bottle releasable right now",
    // never whether this specific wine is the active one.
    expect(isCourseBottleReleasable({ revealedAt: null }, "wine-1")).toBe(false);
  });
});

describe("formatReleaseBottleConfirmTitle", () => {
  it("formats the exact required confirmation title", () => {
    expect(formatReleaseBottleConfirmTitle(3)).toBe("Release Bottle 3?");
  });
});

describe("formatReleaseBottleAriaLabel", () => {
  it("includes the contributor when present", () => {
    expect(formatReleaseBottleAriaLabel(3, "Mia")).toBe("Release Bottle 3, brought by Mia");
  });

  it("omits the contributor clause when absent", () => {
    expect(formatReleaseBottleAriaLabel(3, null)).toBe("Release Bottle 3");
    expect(formatReleaseBottleAriaLabel(3, undefined)).toBe("Release Bottle 3");
  });

  it("omits the contributor clause when blank/whitespace-only", () => {
    expect(formatReleaseBottleAriaLabel(3, "   ")).toBe("Release Bottle 3");
  });
});

describe("formatCourseBottleRowLabel", () => {
  it("matches the existing host-only row label format used elsewhere", () => {
    expect(formatCourseBottleRowLabel(4, "Alice")).toBe("Bottle 4 — Alice");
    expect(formatCourseBottleRowLabel(4, null)).toBe("Bottle 4");
  });
});
