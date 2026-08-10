import { describe, expect, it } from "vitest";
import {
  bottleLabel,
  formatBlindBottleLabel,
  formatTastingOrderAccessibleLabel,
  formatTastingOrderContributorLabel,
  generateSessionCode,
} from "@/lib/codes";
import {
  SESSION_STATUSES,
  TASTING_MODE_DESCRIPTIONS,
  TASTING_MODE_LABELS,
  TASTING_MODES,
  WINE_STYLE_LABELS,
  WINE_STYLES,
} from "@/types/tasting";

describe("bottleLabel", () => {
  it("formats sequential bottle numbers as 'Bottle N'", () => {
    expect(bottleLabel(1)).toBe("Bottle 1");
    expect(bottleLabel(2)).toBe("Bottle 2");
    expect(bottleLabel(42)).toBe("Bottle 42");
  });
});

describe("formatBlindBottleLabel", () => {
  it("appends the contributor's display name with an em dash", () => {
    expect(formatBlindBottleLabel(1, "Justin")).toBe("Bottle 1 — Justin");
    expect(formatBlindBottleLabel(2, "Sarah")).toBe("Bottle 2 — Sarah");
  });

  it("falls back to the plain bottle label when the name is missing", () => {
    expect(formatBlindBottleLabel(1, null)).toBe("Bottle 1");
    expect(formatBlindBottleLabel(1, undefined)).toBe("Bottle 1");
    expect(formatBlindBottleLabel(1)).toBe("Bottle 1");
  });

  it("falls back to the plain bottle label when the name is whitespace-only", () => {
    expect(formatBlindBottleLabel(3, "   ")).toBe("Bottle 3");
    expect(formatBlindBottleLabel(3, "\t\n")).toBe("Bottle 3");
  });

  it("trims surrounding whitespace from a real name", () => {
    expect(formatBlindBottleLabel(4, "  Daniel  ")).toBe("Bottle 4 — Daniel");
  });

  it("preserves Unicode and accented characters", () => {
    expect(formatBlindBottleLabel(5, "José")).toBe("Bottle 5 — José");
    expect(formatBlindBottleLabel(6, "François")).toBe("Bottle 6 — François");
  });
});

describe("formatTastingOrderContributorLabel", () => {
  it("formats the exact required em-dash copy for a standard contributor", () => {
    expect(formatTastingOrderContributorLabel(1, "Ava")).toBe("Bottle 1 — Ava");
    expect(formatTastingOrderContributorLabel(2, "Daniel")).toBe("Bottle 2 — Daniel");
    expect(formatTastingOrderContributorLabel(3, "Mia")).toBe("Bottle 3 — Mia");
  });

  it("falls back to 'Contributor unavailable' when the name is missing", () => {
    expect(formatTastingOrderContributorLabel(4, null)).toBe("Bottle 4 — Contributor unavailable");
    expect(formatTastingOrderContributorLabel(4, undefined)).toBe("Bottle 4 — Contributor unavailable");
    expect(formatTastingOrderContributorLabel(4)).toBe("Bottle 4 — Contributor unavailable");
  });

  it("falls back to 'Contributor unavailable' when the name is whitespace-only", () => {
    expect(formatTastingOrderContributorLabel(5, "   ")).toBe("Bottle 5 — Contributor unavailable");
  });

  it("trims surrounding whitespace from a real name", () => {
    expect(formatTastingOrderContributorLabel(6, "  Daniel  ")).toBe("Bottle 6 — Daniel");
  });

  it("preserves Unicode and accented characters", () => {
    expect(formatTastingOrderContributorLabel(7, "José")).toBe("Bottle 7 — José");
    expect(formatTastingOrderContributorLabel(8, "François")).toBe("Bottle 8 — François");
  });

  it("never invents a name — the fallback text is never mistaken for one", () => {
    expect(formatTastingOrderContributorLabel(9, null)).not.toContain("Host");
  });
});

describe("formatTastingOrderAccessibleLabel", () => {
  it("spells out the relationship in words for a standard contributor", () => {
    expect(formatTastingOrderAccessibleLabel(3, "Mia")).toBe("Bottle 3, brought by Mia");
  });

  it("spells out the fallback in words when the name is missing", () => {
    expect(formatTastingOrderAccessibleLabel(4, null)).toBe("Bottle 4, contributor unavailable");
    expect(formatTastingOrderAccessibleLabel(4, undefined)).toBe("Bottle 4, contributor unavailable");
  });

  it("trims whitespace and preserves accents like the visible label", () => {
    expect(formatTastingOrderAccessibleLabel(5, "  José  ")).toBe("Bottle 5, brought by José");
  });
});

describe("generateSessionCode", () => {
  it("produces a WORD-NN shaped code", () => {
    const code = generateSessionCode();
    expect(code).toMatch(/^[A-Z]+-\d{2}$/);
  });
});

describe("SESSION_STATUSES", () => {
  it("lists registration first, then collecting, then revealed", () => {
    expect(SESSION_STATUSES).toEqual(["registration", "collecting", "revealed"]);
  });
});

describe("WINE_STYLES", () => {
  it("lists exactly the five supported styles", () => {
    expect(WINE_STYLES).toEqual(["bubbles", "white", "red", "sweet", "other"]);
  });

  it("has a display label for every style", () => {
    for (const style of WINE_STYLES) {
      expect(WINE_STYLE_LABELS[style]).toBeTruthy();
    }
  });
});

describe("TASTING_MODES", () => {
  it("lists full_blind, then course_reveal, then seen", () => {
    expect(TASTING_MODES).toEqual(["full_blind", "course_reveal", "seen"]);
  });

  it("defaults to full_blind as the first (host-preselected) option", () => {
    expect(TASTING_MODES[0]).toBe("full_blind");
  });

  it("has the exact required user-facing labels", () => {
    expect(TASTING_MODE_LABELS.full_blind).toBe("Full blind tasting");
    expect(TASTING_MODE_LABELS.course_reveal).toBe("Course-by-course reveal");
    expect(TASTING_MODE_LABELS.seen).toBe("Seen tasting");
  });

  it("has the exact required descriptions", () => {
    expect(TASTING_MODE_DESCRIPTIONS.full_blind).toBe(
      "All bottles are tasted blind before any wines are revealed. Best for comparative tastings where complete objectivity matters."
    );
    expect(TASTING_MODE_DESCRIPTIONS.course_reveal).toBe(
      "Each bottle is tasted blind, then revealed before moving to the next. Best for casual dinners and relaxed tasting discussions."
    );
    expect(TASTING_MODE_DESCRIPTIONS.seen).toBe(
      "All bottles are visible from the start. Best for relaxed tastings where guests want to compare wines openly and rate them at their own pace."
    );
  });
});
