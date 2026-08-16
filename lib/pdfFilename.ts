/**
 * Downloaded PDF filename for a tasting's report — slugifies the session
 * title (so it's always a safe, extension-free filesystem name) and appends
 * the tasting date plus a fixed "-recap" suffix, so repeat downloads of the
 * same tasting land on one predictable filename instead of a browser's
 * "(1)", "(2)" collision-renaming. Never throws on empty/punctuation-only
 * titles — falls back to "tasting" instead.
 */
export function buildReportPdfFilename(title: string, tastingDate: string): string {
  const slug =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tasting";
  const datePart = tastingDate.trim().slice(0, 10);
  return [slug, datePart, "recap"].filter(Boolean).join("-") + ".pdf";
}
