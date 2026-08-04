import { describe, expect, it } from "vitest";
import { bottleLabel, generateSessionCode } from "@/lib/codes";
import { SESSION_STATUSES } from "@/types/tasting";

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
