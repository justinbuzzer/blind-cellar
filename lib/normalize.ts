/**
 * Normalises free-text guesses/answers so comparisons are lenient about
 * case, surrounding whitespace, repeated whitespace, accents, and common
 * punctuation (hyphens, apostrophes) without being so loose that different
 * words start matching each other.
 */

// Combining diacritical marks (U+0300-U+036F) produced by NFD decomposition,
// e.g. "e" + combining acute -> stripped to plain "e".
const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .trim()
    .replace(/['`‘’]/g, "") // drop apostrophes (straight, backtick, curly)
    .replace(/[-_]/g, " ") // hyphens/underscores become spaces
    .replace(/[.,]/g, "") // drop periods and commas
    .replace(/\s+/g, " "); // collapse repeated whitespace
}

/** True when two free-text values are equal after normalisation. */
export function isNormalizedMatch(a: string, b: string): boolean {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  return normA.length > 0 && normA === normB;
}
