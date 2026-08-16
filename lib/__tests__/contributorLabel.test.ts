import { describe, expect, it } from "vitest";
import {
  formatBottleAccessibleLabel,
  formatContributorBottleLabel,
  wineStyleToContributorBucket,
} from "@/lib/contributorLabel";

describe("wineStyleToContributorBucket", () => {
  it("passes red/white/bubbles through unchanged", () => {
    expect(wineStyleToContributorBucket("red")).toBe("red");
    expect(wineStyleToContributorBucket("white")).toBe("white");
    expect(wineStyleToContributorBucket("bubbles")).toBe("bubbles");
  });

  it("collapses sweet and other into other", () => {
    expect(wineStyleToContributorBucket("sweet")).toBe("other");
    expect(wineStyleToContributorBucket("other")).toBe("other");
  });
});

describe("formatContributorBottleLabel", () => {
  it("formats a red contributor label", () => {
    expect(
      formatContributorBottleLabel({
        contributorDisplayName: "Ava",
        styleBucket: "red",
        contributorStyleSequence: 1,
      })
    ).toBe("Ava — Red #1");
  });

  it("formats a white contributor label", () => {
    expect(
      formatContributorBottleLabel({
        contributorDisplayName: "Ava",
        styleBucket: "white",
        contributorStyleSequence: 2,
      })
    ).toBe("Ava — White #2");
  });

  it("formats a bubbles contributor label", () => {
    expect(
      formatContributorBottleLabel({
        contributorDisplayName: "Daniel",
        styleBucket: "bubbles",
        contributorStyleSequence: 1,
      })
    ).toBe("Daniel — Bubbles #1");
  });

  it("formats an other-bucket contributor label", () => {
    expect(
      formatContributorBottleLabel({
        contributorDisplayName: "Mia",
        styleBucket: "other",
        contributorStyleSequence: 3,
      })
    ).toBe("Mia — Other #3");
  });

  it("preserves accented/cased display names exactly", () => {
    expect(
      formatContributorBottleLabel({
        contributorDisplayName: "José",
        styleBucket: "red",
        contributorStyleSequence: 1,
      })
    ).toBe("José — Red #1");
  });

  it("uses an em dash with spaces, never parentheses or raw registration-order language", () => {
    const label = formatContributorBottleLabel({
      contributorDisplayName: "Ava",
      styleBucket: "red",
      contributorStyleSequence: 1,
    });
    expect(label).toContain(" — ");
    expect(label).not.toMatch(/[()]/);
    expect(label).not.toMatch(/bottle #/i);
  });

  it("returns null when there is no contributor name", () => {
    expect(
      formatContributorBottleLabel({
        contributorDisplayName: null,
        styleBucket: "red",
        contributorStyleSequence: 1,
      })
    ).toBeNull();
    expect(
      formatContributorBottleLabel({
        contributorDisplayName: undefined,
        styleBucket: "red",
        contributorStyleSequence: 1,
      })
    ).toBeNull();
    expect(
      formatContributorBottleLabel({
        contributorDisplayName: "   ",
        styleBucket: "red",
        contributorStyleSequence: 1,
      })
    ).toBeNull();
  });

  it("falls back to the bare name when style/sequence is unavailable, never a fabricated number", () => {
    const label = formatContributorBottleLabel({
      contributorDisplayName: "Ava",
      styleBucket: null,
      contributorStyleSequence: null,
    });
    expect(label).toBe("Ava");
    expect(label).not.toContain("undefined");
    expect(label).not.toContain("null");
    expect(label).not.toContain("#0");
  });

  it("never leaks personal/contact/account/token/cellar/private data — only name, bucket label, and sequence appear", () => {
    const label = formatContributorBottleLabel({
      contributorDisplayName: "Ava",
      styleBucket: "red",
      contributorStyleSequence: 1,
    });
    expect(label).toBe("Ava — Red #1");
  });
});

describe("formatBottleAccessibleLabel", () => {
  it("spells out both the tasting-order number and contributor context", () => {
    expect(
      formatBottleAccessibleLabel(3, {
        contributorDisplayName: "Ava",
        styleBucket: "red",
        contributorStyleSequence: 1,
      })
    ).toBe("Bottle 3. Contributed by Ava, Red bottle 1.");
  });

  it("falls back to just the bottle number when there is no contributor name", () => {
    expect(
      formatBottleAccessibleLabel(3, {
        contributorDisplayName: null,
        styleBucket: null,
        contributorStyleSequence: null,
      })
    ).toBe("Bottle 3.");
  });

  it("falls back to name-only phrasing when style/sequence is unavailable", () => {
    expect(
      formatBottleAccessibleLabel(3, {
        contributorDisplayName: "Ava",
        styleBucket: null,
        contributorStyleSequence: null,
      })
    ).toBe("Bottle 3. Contributed by Ava.");
  });
});
