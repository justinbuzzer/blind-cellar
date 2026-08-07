import { normalizeText } from "./normalize";

/**
 * Static, curated reference data for the controlled country / region / grape
 * vocabulary used by bottle registration and guess entry. Kept local and
 * static on purpose (no external wine API) — see README for rationale.
 *
 * Canonicalisation choice: both country and region are stored as their
 * canonical *display name* (not an ISO code) in the database. This keeps a
 * legacy free-text value (e.g. "France" from a bottle registered before this
 * module existed) and a new controlled-dropdown value directly comparable
 * via the existing text-normalisation matcher, with no separate code<->name
 * bridging layer. See SUPABASE_SETUP.md for the full rationale.
 */

export interface OptionItem {
  value: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------

export const COUNTRIES: string[] = [
  "Argentina",
  "Australia",
  "Austria",
  "Chile",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Italy",
  "New Zealand",
  "Portugal",
  "South Africa",
  "Spain",
  "United States",
  "United Kingdom",
  "Other / Unknown",
];

export const COUNTRY_OPTIONS: OptionItem[] = COUNTRIES.map((name) => ({
  value: name,
  label: name,
}));

export function isKnownCountry(value: string): boolean {
  return COUNTRIES.includes(value);
}

// ---------------------------------------------------------------------------
// Regions, grouped by country. Every country in COUNTRIES must have an entry
// here (enforced by a dev-time check further down).
// ---------------------------------------------------------------------------

export const REGIONS_BY_COUNTRY: Record<string, string[]> = {
  France: [
    "Alsace",
    "Beaujolais",
    "Bordeaux",
    "Burgundy",
    "Champagne",
    "Corsica",
    "Jura",
    "Languedoc-Roussillon",
    "Loire Valley",
    "Provence",
    "Rhône Valley",
    "Savoie",
    "South West France",
  ],
  Italy: [
    "Abruzzo",
    "Campania",
    "Emilia-Romagna",
    "Friuli-Venezia Giulia",
    "Liguria",
    "Lombardy",
    "Marche",
    "Piedmont",
    "Puglia",
    "Sicily",
    "Tuscany",
    "Trentino-Alto Adige",
    "Umbria",
    "Veneto",
  ],
  Spain: [
    "Andalucía",
    "Catalonia",
    "Galicia",
    "Jerez",
    "La Rioja",
    "Priorat",
    "Ribera del Duero",
    "Rías Baixas",
    "Valencia",
  ],
  "United States": [
    "California",
    "Oregon",
    "Washington",
    "New York",
    "Other United States",
  ],
  Australia: [
    "Adelaide Hills",
    "Barossa Valley",
    "Coonawarra",
    "Hunter Valley",
    "Margaret River",
    "McLaren Vale",
    "Mornington Peninsula",
    "New South Wales",
    "South Australia",
    "Victoria",
    "Western Australia",
    "Yarra Valley",
    "Other Australia",
  ],
  "New Zealand": [
    "Central Otago",
    "Hawke's Bay",
    "Marlborough",
    "Martinborough",
    "Nelson",
    "Wairarapa",
    "Other New Zealand",
  ],
  Germany: [
    "Ahr",
    "Baden",
    "Franken",
    "Mosel",
    "Nahe",
    "Pfalz",
    "Rheingau",
    "Rheinhessen",
    "Württemberg",
  ],
  Austria: [
    "Burgenland",
    "Kamptal",
    "Kremstal",
    "Neusiedlersee",
    "Niederösterreich",
    "Styria",
    "Wachau",
    "Weinviertel",
  ],
  Portugal: [
    "Alentejo",
    "Bairrada",
    "Dão",
    "Douro",
    "Madeira",
    "Setúbal",
    "Vinho Verde",
  ],
  "South Africa": [
    "Coastal Region",
    "Constantia",
    "Elgin",
    "Franschhoek",
    "Stellenbosch",
    "Swartland",
    "Walker Bay",
    "Western Cape",
  ],
  Chile: [
    "Aconcagua Valley",
    "Casablanca Valley",
    "Colchagua Valley",
    "Maipo Valley",
    "Maule Valley",
    "Rapel Valley",
  ],
  Argentina: ["Mendoza", "Patagonia", "Salta", "San Juan", "Uco Valley"],
  Greece: ["Crete", "Macedonia", "Nemea", "Peloponnese", "Santorini"],
  Hungary: ["Eger", "Somló", "Szekszárd", "Tokaj", "Villány"],
  "United Kingdom": ["England", "Wales"],
  "Other / Unknown": ["Other / Unknown"],
};

if (process.env.NODE_ENV !== "production") {
  const missing = COUNTRIES.filter((c) => !REGIONS_BY_COUNTRY[c]);
  if (missing.length > 0) {
    throw new Error(
      `wineReferenceData: missing REGIONS_BY_COUNTRY entry for: ${missing.join(", ")}`
    );
  }
}

export function regionOptionsForCountry(country: string): OptionItem[] {
  const regions = REGIONS_BY_COUNTRY[country] ?? [];
  return regions.map((name) => ({ value: name, label: name }));
}

export function isValidRegionForCountry(country: string, region: string): boolean {
  return (REGIONS_BY_COUNTRY[country] ?? []).includes(region);
}

/**
 * Computes the region value to keep after a country change: the current
 * region if it's still valid for the new country, otherwise "" (forcing a
 * fresh region selection). Shared by BottleForm and WineGuessForm so the
 * reset behaviour is identical and independently testable.
 */
export function resetRegionIfInvalid(nextCountry: string, currentRegion: string): string {
  return isValidRegionForCountry(nextCountry, currentRegion) ? currentRegion : "";
}

// ---------------------------------------------------------------------------
// Single-variety grapes. `value` is the canonical stored/compared form;
// `label` may combine well-known synonyms for display in the dropdown.
// Extend this list freely — nothing elsewhere hard-codes grape names.
// ---------------------------------------------------------------------------

export interface GrapeVarietyOption {
  value: string;
  label: string;
}

export const GRAPE_VARIETIES: GrapeVarietyOption[] = [
  { value: "Albariño", label: "Albariño" },
  { value: "Cabernet Franc", label: "Cabernet Franc" },
  { value: "Cabernet Sauvignon", label: "Cabernet Sauvignon" },
  { value: "Carménère", label: "Carménère" },
  { value: "Chardonnay", label: "Chardonnay" },
  { value: "Chenin Blanc", label: "Chenin Blanc" },
  { value: "Gamay", label: "Gamay" },
  { value: "Gewürztraminer", label: "Gewürztraminer" },
  { value: "Grenache", label: "Grenache" },
  { value: "Grüner Veltliner", label: "Grüner Veltliner" },
  { value: "Malbec", label: "Malbec" },
  { value: "Marsanne", label: "Marsanne" },
  { value: "Merlot", label: "Merlot" },
  { value: "Mourvèdre", label: "Mourvèdre" },
  { value: "Muscat", label: "Muscat" },
  { value: "Nebbiolo", label: "Nebbiolo" },
  { value: "Palomino", label: "Palomino" },
  { value: "Pinot Blanc", label: "Pinot Blanc" },
  { value: "Pinot Gris", label: "Pinot Gris / Pinot Grigio" },
  { value: "Pinot Noir", label: "Pinot Noir" },
  { value: "Riesling", label: "Riesling" },
  { value: "Roussanne", label: "Roussanne" },
  { value: "Sangiovese", label: "Sangiovese" },
  { value: "Sauvignon Blanc", label: "Sauvignon Blanc" },
  { value: "Sémillon", label: "Sémillon" },
  { value: "Syrah", label: "Syrah / Shiraz" },
  { value: "Tempranillo", label: "Tempranillo" },
  { value: "Touriga Nacional", label: "Touriga Nacional" },
  { value: "Viognier", label: "Viognier" },
  { value: "Zinfandel", label: "Zinfandel / Primitivo" },
];

export const GRAPE_VARIETY_OPTIONS: OptionItem[] = GRAPE_VARIETIES.map((g) => ({
  value: g.value,
  label: g.label,
}));

/**
 * Alternate spellings that must canonicalise to the same grape for scoring,
 * without implying any relationship between unrelated grapes. Keys are raw
 * (pre-normalisation) aliases; values are the canonical `GRAPE_VARIETIES`
 * value they resolve to.
 */
const GRAPE_ALIASES: Record<string, string> = {
  Shiraz: "Syrah",
  "Pinot Grigio": "Pinot Gris",
  Primitivo: "Zinfandel",
};

const KNOWN_GRAPE_BY_NORMALIZED_NAME = new Map<string, string>();
for (const grape of GRAPE_VARIETIES) {
  KNOWN_GRAPE_BY_NORMALIZED_NAME.set(normalizeText(grape.value), grape.value);
}
for (const [alias, canonical] of Object.entries(GRAPE_ALIASES)) {
  KNOWN_GRAPE_BY_NORMALIZED_NAME.set(normalizeText(alias), canonical);
}

export function isKnownGrapeVariety(value: string): boolean {
  return KNOWN_GRAPE_BY_NORMALIZED_NAME.has(normalizeText(value));
}

/** Resolves a raw grape name/alias to its canonical *display* form (e.g. "Shiraz" -> "Syrah"), or null if unrecognised. */
export function resolveKnownGrapeDisplayName(raw: string): string | null {
  return KNOWN_GRAPE_BY_NORMALIZED_NAME.get(normalizeText(raw)) ?? null;
}

/**
 * Canonicalises one grape name/token for comparison purposes: resolves known
 * aliases (Shiraz -> Syrah, etc.) to a single normalised form, and otherwise
 * falls back to plain text normalisation — so unrecognised grapes (typos,
 * obscure varieties, legacy free text) still compare consistently without
 * ever being guessed at or matched to something they aren't.
 */
export function canonicalizeGrapeToken(raw: string): string {
  const normalized = normalizeText(raw);
  if (!normalized) return "";
  const known = KNOWN_GRAPE_BY_NORMALIZED_NAME.get(normalized);
  return known ? normalizeText(known) : normalized;
}

const BLEND_SEPARATOR_REGEX = /[,/;&-]/;

/**
 * Splits a free-text blend description into canonicalised grape tokens,
 * e.g. "Cabernet Sauvignon / Merlot" and "Merlot, Cabernet Sauvignon" both
 * produce the same two-token set regardless of order.
 */
export function blendTokensFromText(raw: string): string[] {
  return raw
    .split(BLEND_SEPARATOR_REGEX)
    .map((token) => canonicalizeGrapeToken(token))
    .filter((token) => token.length > 0);
}

// ---------------------------------------------------------------------------
// Structured blend selector helpers. The multi-select picker stores its
// state as two pieces — curated `selectedGrapes` (checkbox picks) and free
// `otherGrapesText` (for varieties not on the curated list) — and these
// helpers turn that into the single canonical, alphabetically-ordered
// component list used for both the flattened display/storage text
// ("Cabernet Sauvignon / Merlot") and blend-vs-blend scoring, which already
// works by re-tokenising that same flattened text (see `blendTokensFromText`
// above) — so no scoring changes were needed for this feature.
// ---------------------------------------------------------------------------

// Deliberately excludes the hyphen that BLEND_SEPARATOR_REGEX uses: this
// splits *free-typed* "other grapes" text, where a hyphen is more likely to
// be part of a grape name than a separator (unlike the flattened blend
// display text, which this app always joins with " / ").
const OTHER_GRAPES_SEPARATOR_REGEX = /[,/;&\n]/;

/**
 * Splits the free-text "other grapes" field into individual entries,
 * resolving any recognised grape/alias to its canonical display form (e.g.
 * "Shiraz" -> "Syrah") and otherwise preserving the entry as typed. Trims
 * whitespace and drops case-insensitive duplicates within the field itself.
 */
export function parseOtherGrapesText(raw: string): string[] {
  const tokens = raw
    .split(OTHER_GRAPES_SEPARATOR_REGEX)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    const display = resolveKnownGrapeDisplayName(token) ?? token;
    const key = normalizeText(display);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(display);
  }
  return result;
}

/**
 * Combines curated multi-select grapes with parsed "other grapes" free text
 * into the final canonical blend component list: deduplicated (a grape
 * already picked from the curated list can't also be re-added via free
 * text), alphabetically ordered by canonical name (not selection order).
 */
export function combineBlendComponents(
  selectedGrapes: string[],
  otherGrapesText: string
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const grape of [...selectedGrapes, ...parseOtherGrapesText(otherGrapesText)]) {
    const key = normalizeText(grape);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(grape);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

/**
 * Best-effort reconstruction of the structured multi-select state from a
 * flattened blend string that has no structured `grape_blend_components`
 * record — either a historical blend from before this feature, or (in
 * principle) any blend-mode value that only has the flattened text. Splits
 * on the same separators as `blendTokensFromText`; any token that resolves
 * to a known grape/alias becomes a pre-checked curated selection, and
 * everything else is preserved verbatim (not re-canonicalised) in the
 * "other grapes" text so nothing the contributor originally entered is lost
 * or silently rewritten just by opening the edit form.
 */
export function reconstructBlendComponentsFromText(rawText: string): {
  selectedGrapes: string[];
  otherGrapesText: string;
} {
  const tokens = rawText
    .split(BLEND_SEPARATOR_REGEX)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const selectedGrapes: string[] = [];
  const otherTokens: string[] = [];
  const seenSelected = new Set<string>();
  for (const token of tokens) {
    const known = resolveKnownGrapeDisplayName(token);
    if (known) {
      const key = normalizeText(known);
      if (!seenSelected.has(key)) {
        seenSelected.add(key);
        selectedGrapes.push(known);
      }
    } else {
      otherTokens.push(token);
    }
  }

  return {
    selectedGrapes: selectedGrapes.sort((a, b) => a.localeCompare(b)),
    otherGrapesText: otherTokens.join(", "),
  };
}
