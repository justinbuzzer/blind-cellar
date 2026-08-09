const SESSION_CODE_WORDS = [
  "MAROON",
  "CLARET",
  "AMBER",
  "CELLAR",
  "VELVET",
  "OAK",
  "TANNIN",
  "HARVEST",
  "VINTAGE",
  "TERROIR",
  "BARREL",
  "GARNET",
];

/** Generates a short human-readable session code, e.g. "MAROON-42". */
export function generateSessionCode(): string {
  const word =
    SESSION_CODE_WORDS[Math.floor(Math.random() * SESSION_CODE_WORDS.length)];
  const number = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${word}-${number}`;
}

/** Formats a bottle number as the display label used throughout the app. */
export function bottleLabel(bottleNumber: number): string {
  return `Bottle ${bottleNumber}`;
}

/**
 * Bottle-order contributor label for Full blind/Course-by-course guess entry
 * (see README "Bottle-order contributor labels") — a pouring/navigation
 * coordination cue only, never a wine-identity reveal. Built on `bottleLabel`
 * rather than duplicating "Bottle N" formatting, so the two can never drift.
 * A blank/whitespace-only or missing name falls back to the plain bottle
 * label instead of a dangling em dash or a placeholder like "Unknown".
 */
export function formatBlindBottleLabel(
  bottleNumber: number,
  contributorDisplayName?: string | null
): string {
  const name = contributorDisplayName?.trim();
  return name ? `${bottleLabel(bottleNumber)} — ${name}` : bottleLabel(bottleNumber);
}
