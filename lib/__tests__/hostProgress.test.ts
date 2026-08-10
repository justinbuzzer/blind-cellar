import { describe, expect, it } from "vitest";
import {
  NO_ELIGIBLE_PARTICIPANTS_MESSAGE,
  RATING_PROGRESS_TITLE,
  formatAllSubmittedMessage,
  formatGroupProgressLine,
  formatGroupProgressUpdateAnnouncement,
  formatGuessProgressTitle,
  formatMissingSectionHeading,
  formatProgressAccessibleLabel,
  formatProgressStatusLine,
  formatProgressTooltip,
  formatProgressUpdateAnnouncement,
} from "@/lib/hostProgress";

describe("formatGuessProgressTitle", () => {
  it("formats the exact required copy", () => {
    expect(formatGuessProgressTitle(3)).toBe("Bottle 3 guess progress");
    expect(formatGuessProgressTitle(1)).toBe("Bottle 1 guess progress");
  });
});

describe("RATING_PROGRESS_TITLE", () => {
  it("is the fixed Seen popover title", () => {
    expect(RATING_PROGRESS_TITLE).toBe("Rating progress");
  });
});

describe("formatProgressAccessibleLabel", () => {
  it("formats the guess-kind label with the bottle number", () => {
    expect(formatProgressAccessibleLabel("guess", { bottleNumber: 3 })).toBe(
      "View guess progress for Bottle 3"
    );
  });

  it("formats the rating-kind label with the safe wine identity", () => {
    expect(
      formatProgressAccessibleLabel("rating", { wineIdentityLabel: "Domaine Leflaive — Puligny-Montrachet" })
    ).toBe("View rating progress for Domaine Leflaive — Puligny-Montrachet");
  });
});

describe("formatProgressTooltip", () => {
  it("formats the exact required tooltip copy per kind", () => {
    expect(formatProgressTooltip("guess")).toBe("View guess progress");
    expect(formatProgressTooltip("rating")).toBe("View rating progress");
  });
});

describe("formatProgressStatusLine", () => {
  it("formats the guess-kind status line", () => {
    expect(formatProgressStatusLine("guess", 5, 8)).toBe("5 of 8 submitted");
  });

  it("formats the rating-kind status line", () => {
    expect(formatProgressStatusLine("rating", 5, 8)).toBe("5 of 8 rated");
  });

  it("formats zero submitted correctly", () => {
    expect(formatProgressStatusLine("guess", 0, 8)).toBe("0 of 8 submitted");
  });
});

describe("formatMissingSectionHeading", () => {
  it("formats the exact required heading per kind", () => {
    expect(formatMissingSectionHeading("guess")).toBe("Still to submit");
    expect(formatMissingSectionHeading("rating")).toBe("Still to rate");
  });
});

describe("formatAllSubmittedMessage", () => {
  it("formats the exact required all-complete copy per kind", () => {
    expect(formatAllSubmittedMessage("guess")).toBe("All eligible participants have submitted.");
    expect(formatAllSubmittedMessage("rating")).toBe("All eligible participants have rated.");
  });
});

describe("NO_ELIGIBLE_PARTICIPANTS_MESSAGE", () => {
  it("is the exact required zero-eligible copy", () => {
    expect(NO_ELIGIBLE_PARTICIPANTS_MESSAGE).toBe("No eligible participants yet.");
  });
});

describe("formatProgressUpdateAnnouncement", () => {
  it("formats a polite live-region announcement for a guess refresh", () => {
    expect(formatProgressUpdateAnnouncement("guess", 6, 8)).toBe(
      "Guess progress updated: 6 of 8 submitted."
    );
  });

  it("formats a polite live-region announcement for a rating refresh", () => {
    expect(formatProgressUpdateAnnouncement("rating", 6, 8)).toBe(
      "Rating progress updated: 6 of 8 rated."
    );
  });
});

describe("formatGroupProgressLine", () => {
  it("formats the exact required host guess-screen copy", () => {
    expect(formatGroupProgressLine(6, 8)).toBe("Group progress · 6 of 8 submitted");
    expect(formatGroupProgressLine(0, 8)).toBe("Group progress · 0 of 8 submitted");
    expect(formatGroupProgressLine(8, 8)).toBe("Group progress · 8 of 8 submitted");
  });

  it("never uses the word 'guests'", () => {
    expect(formatGroupProgressLine(6, 8)).not.toMatch(/guests/i);
  });

  it("defaults to the guess/submitted wording when no kind is given", () => {
    expect(formatGroupProgressLine(6, 8)).toBe(formatGroupProgressLine(6, 8, "guess"));
  });

  it("formats the rated variant for Seen mode's Current tasting summary", () => {
    expect(formatGroupProgressLine(6, 8, "rating")).toBe("Group progress · 6 of 8 rated");
  });
});

describe("formatGroupProgressUpdateAnnouncement", () => {
  it("formats the exact required host guess-screen live-region text", () => {
    expect(formatGroupProgressUpdateAnnouncement(7, 8)).toBe(
      "Group progress updated: 7 of 8 submitted."
    );
  });

  it("formats the rated variant", () => {
    expect(formatGroupProgressUpdateAnnouncement(7, 8, "rating")).toBe(
      "Group progress updated: 7 of 8 rated."
    );
  });
});
