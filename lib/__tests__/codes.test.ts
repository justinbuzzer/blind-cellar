import { describe, expect, it } from "vitest";
import { bottleLabel, generateSessionCode } from "@/lib/codes";
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
