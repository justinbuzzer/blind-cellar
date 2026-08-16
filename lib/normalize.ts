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

// ---------------------------------------------------------------------------
// Producer / Cuvée blind-match normalisation (core_v3_appellation_conditional
// only — see README "Scoring model"). Deliberately narrower and separate from
// normalizeText/isNormalizedMatch above: no accent-folding, no punctuation
// stripping, no hyphen-as-space, no apostrophe removal. This is not general
// fuzzy matching — Producer additionally tolerates exactly one leading
// standalone "Château"/"Chateau"/"Domaine" descriptor token; Cuvée never
// strips anything beyond case.
// ---------------------------------------------------------------------------

const PRODUCER_LEADING_DESCRIPTORS = new Set(["château", "chateau", "domaine"]);

/**
 * Case-folds a Producer value and removes exactly one leading standalone
 * "Château"/"Chateau"/"Domaine" token, only when a non-empty remainder is
 * left. Returns null for a blank/missing value so a blank guess is never
 * treated as matching anything, including another blank. Never touches a
 * descriptor that isn't the very first whitespace-delimited token (a
 * hyphenated "Chateau-Margaux", a plural "Domaines", or an embedded
 * "Maison du Château" are all left completely alone), and never removes more
 * than one token.
 */
export function normalizeProducerForBlindMatch(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLocaleLowerCase("und");
  const spaceIndex = lower.indexOf(" ");
  if (spaceIndex > 0) {
    const firstWord = lower.slice(0, spaceIndex);
    if (PRODUCER_LEADING_DESCRIPTORS.has(firstWord)) {
      const rest = lower.slice(spaceIndex + 1).trim();
      if (rest) return rest;
    }
  }
  return lower;
}

/**
 * Case-folds a Cuvée value only — never removes a leading Producer
 * descriptor or anything else. Returns null for a blank/missing value, same
 * convention as normalizeProducerForBlindMatch.
 */
export function normalizeCuveeForBlindMatch(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLocaleLowerCase("und");
}

/** True when two Producer values match under normalizeProducerForBlindMatch. A blank guess never matches, even against a blank answer. */
export function isProducerBlindMatch(guess: string, answer: string): boolean {
  const normGuess = normalizeProducerForBlindMatch(guess);
  return normGuess !== null && normGuess === normalizeProducerForBlindMatch(answer);
}

/** True when two Cuvée values match under normalizeCuveeForBlindMatch. A blank guess never matches, even against a blank answer. */
export function isCuveeBlindMatch(guess: string, answer: string): boolean {
  const normGuess = normalizeCuveeForBlindMatch(guess);
  return normGuess !== null && normGuess === normalizeCuveeForBlindMatch(answer);
}
