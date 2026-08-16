import { describe, expect, it } from "vitest";
import { buildReportPdfFilename } from "@/lib/pdfFilename";

describe("buildReportPdfFilename", () => {
  it("slugifies a simple title and appends the date and suffix", () => {
    expect(buildReportPdfFilename("Friday Night Flight", "2026-08-14")).toBe(
      "friday-night-flight-2026-08-14-recap.pdf"
    );
  });

  it("strips punctuation and collapses runs into single dashes", () => {
    expect(buildReportPdfFilename("Ava & Sam's Tasting!! (Round 2)", "2026-01-01")).toBe(
      "ava-sam-s-tasting-round-2-2026-01-01-recap.pdf"
    );
  });

  it("trims leading/trailing dashes left over from punctuation", () => {
    expect(buildReportPdfFilename("--Cellar Night--", "2026-01-01")).toBe(
      "cellar-night-2026-01-01-recap.pdf"
    );
  });

  it("falls back to 'tasting' for an empty or punctuation-only title", () => {
    expect(buildReportPdfFilename("", "2026-01-01")).toBe("tasting-2026-01-01-recap.pdf");
    expect(buildReportPdfFilename("!!!", "2026-01-01")).toBe("tasting-2026-01-01-recap.pdf");
  });

  it("truncates a full ISO timestamp down to just the date", () => {
    expect(buildReportPdfFilename("Cellar Night", "2026-01-01T18:30:00.000Z")).toBe(
      "cellar-night-2026-01-01-recap.pdf"
    );
  });

  it("omits the date segment entirely when no date is given", () => {
    expect(buildReportPdfFilename("Cellar Night", "")).toBe("cellar-night-recap.pdf");
  });
});
