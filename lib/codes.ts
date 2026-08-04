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
