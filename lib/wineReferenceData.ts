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
  "United Kingdom",
  "United States",
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

/**
 * A standard grape's skin colour — used only for filtering the single-variety
 * dropdown by wine style (see README "Grape-entry assistance"). Purely a
 * display/filtering classification: it never affects validation or scoring.
 * "Other grape" (the free-text fallback) is deliberately never classified —
 * it isn't a standard grape, so grape-assistance colour clearing never
 * applies to a custom entry (see lib/grapeAssistance.ts).
 */
export type GrapeSkin = "red" | "white";

export interface GrapeVarietyOption {
  value: string;
  label: string;
  skin: GrapeSkin;
}

export const GRAPE_VARIETIES: GrapeVarietyOption[] = [
  { value: "Albariño", label: "Albariño", skin: "white" },
  { value: "Aglianico", label: "Aglianico", skin: "red" },
  { value: "Alfrocheiro", label: "Alfrocheiro", skin: "red" },
  { value: "Alicante Bouschet", label: "Alicante Bouschet", skin: "red" },
  { value: "Aligoté", label: "Aligoté", skin: "white" },
  { value: "Antão Vaz", label: "Antão Vaz", skin: "white" },
  { value: "Arinto", label: "Arinto", skin: "white" },
  { value: "Barbera", label: "Barbera", skin: "red" },
  { value: "Bical", label: "Bical", skin: "white" },
  { value: "Braquet", label: "Braquet", skin: "red" },
  { value: "Brachetto", label: "Brachetto", skin: "red" },
  { value: "Cabernet Franc", label: "Cabernet Franc", skin: "red" },
  { value: "Cabernet Sauvignon", label: "Cabernet Sauvignon", skin: "red" },
  { value: "Caiño Blanco", label: "Caiño Blanco", skin: "white" },
  { value: "Canaiolo", label: "Canaiolo", skin: "red" },
  { value: "Carignan", label: "Carignan / Mazuelo / Cariñena", skin: "red" },
  { value: "Carménère", label: "Carménère", skin: "red" },
  { value: "Carricante", label: "Carricante", skin: "white" },
  { value: "Catarratto", label: "Catarratto", skin: "white" },
  { value: "Chardonnay", label: "Chardonnay", skin: "white" },
  { value: "Chenin Blanc", label: "Chenin Blanc", skin: "white" },
  { value: "Cinsault", label: "Cinsault", skin: "red" },
  { value: "Clairette", label: "Clairette", skin: "white" },
  { value: "Colorino", label: "Colorino", skin: "red" },
  { value: "Corvina", label: "Corvina", skin: "red" },
  { value: "Corvinone", label: "Corvinone", skin: "red" },
  { value: "Cortese", label: "Cortese", skin: "white" },
  { value: "Dolcetto", label: "Dolcetto", skin: "red" },
  { value: "Encruzado", label: "Encruzado", skin: "white" },
  { value: "Falanghina", label: "Falanghina", skin: "white" },
  { value: "Fiano", label: "Fiano", skin: "white" },
  { value: "Folle Noire", label: "Folle Noire", skin: "red" },
  { value: "Frappato", label: "Frappato", skin: "red" },
  { value: "Gamay", label: "Gamay", skin: "red" },
  { value: "Garganega", label: "Garganega", skin: "white" },
  { value: "Gewürztraminer", label: "Gewürztraminer", skin: "white" },
  { value: "Glera", label: "Glera", skin: "white" },
  { value: "Gouveio", label: "Gouveio", skin: "white" },
  { value: "Graciano", label: "Graciano", skin: "red" },
  { value: "Grenache", label: "Grenache / Garnacha", skin: "red" },
  { value: "Grenache Blanc", label: "Grenache Blanc / Garnacha Blanca", skin: "white" },
  { value: "Greco", label: "Greco", skin: "white" },
  { value: "Grillo", label: "Grillo", skin: "white" },
  { value: "Grüner Veltliner", label: "Grüner Veltliner", skin: "white" },
  { value: "Inzolia", label: "Inzolia", skin: "white" },
  { value: "Loureira", label: "Loureira", skin: "white" },
  { value: "Malbec", label: "Malbec", skin: "red" },
  { value: "Malvasia", label: "Malvasia", skin: "white" },
  { value: "Malvasia Fina", label: "Malvasia Fina", skin: "white" },
  { value: "Marsanne", label: "Marsanne", skin: "white" },
  { value: "Melon de Bourgogne", label: "Melon de Bourgogne", skin: "white" },
  { value: "Merlot", label: "Merlot", skin: "red" },
  { value: "Mourvèdre", label: "Mourvèdre / Mataro", skin: "red" },
  { value: "Muscat", label: "Muscat / Moscato Bianco", skin: "white" },
  { value: "Nebbiolo", label: "Nebbiolo", skin: "red" },
  { value: "Nerello Mascalese", label: "Nerello Mascalese", skin: "red" },
  { value: "Nero d'Avola", label: "Nero d'Avola", skin: "red" },
  { value: "Palomino", label: "Palomino / Palomino Fino", skin: "white" },
  { value: "Piedirosso", label: "Piedirosso", skin: "red" },
  { value: "Pinot Blanc", label: "Pinot Blanc", skin: "white" },
  { value: "Pinot Gris", label: "Pinot Gris / Pinot Grigio", skin: "white" },
  { value: "Pinot Noir", label: "Pinot Noir", skin: "red" },
  { value: "Pinot Meunier", label: "Pinot Meunier", skin: "red" },
  { value: "Rabigato", label: "Rabigato", skin: "white" },
  { value: "Riesling", label: "Riesling", skin: "white" },
  { value: "Rolle", label: "Rolle", skin: "white" },
  { value: "Rondinella", label: "Rondinella", skin: "red" },
  { value: "Roupeiro", label: "Roupeiro", skin: "white" },
  { value: "Roussanne", label: "Roussanne", skin: "white" },
  { value: "Sangiovese", label: "Sangiovese", skin: "red" },
  { value: "Sauvignon Blanc", label: "Sauvignon Blanc", skin: "white" },
  { value: "Sémillon", label: "Sémillon", skin: "white" },
  { value: "Syrah", label: "Syrah / Shiraz", skin: "red" },
  { value: "Tempranillo", label: "Tempranillo / Tinta Roriz / Aragonez", skin: "red" },
  { value: "Touriga Franca", label: "Touriga Franca", skin: "red" },
  { value: "Touriga Nacional", label: "Touriga Nacional", skin: "red" },
  { value: "Trebbiano", label: "Trebbiano", skin: "white" },
  { value: "Trebbiano di Soave", label: "Trebbiano di Soave", skin: "white" },
  { value: "Treixadura", label: "Treixadura", skin: "white" },
  { value: "Trincadeira", label: "Trincadeira", skin: "red" },
  { value: "Vernaccia", label: "Vernaccia", skin: "white" },
  { value: "Verdelho", label: "Verdelho", skin: "white" },
  { value: "Viognier", label: "Viognier", skin: "white" },
  { value: "Viosinho", label: "Viosinho", skin: "white" },
  { value: "Viura", label: "Viura", skin: "white" },
  { value: "Zinfandel", label: "Zinfandel / Primitivo", skin: "red" },
];

export const GRAPE_VARIETY_OPTIONS: OptionItem[] = GRAPE_VARIETIES.map((g) => ({
  value: g.value,
  label: g.label,
}));

if (process.env.NODE_ENV !== "production") {
  const seenGrapeValues = new Set<string>();
  for (const grape of GRAPE_VARIETIES) {
    const key = normalizeText(grape.value);
    if (seenGrapeValues.has(key)) {
      throw new Error(`wineReferenceData: duplicate GRAPE_VARIETIES value "${grape.value}"`);
    }
    seenGrapeValues.add(key);
  }
}

/**
 * The GRAPE_VARIETIES values most likely to come up at a casual tasting,
 * most-to-least common — used only to sort them to the top of a
 * *registration* grape dropdown/multi-select (see grapeVarietiesPopularFirst
 * below). Purely a display-ordering aid: it never affects validation,
 * scoring, storage, or which grapes exist.
 */
const POPULAR_GRAPE_VALUES: string[] = [
  "Cabernet Sauvignon",
  "Merlot",
  "Chardonnay",
  "Pinot Noir",
  "Sauvignon Blanc",
  "Syrah",
  "Riesling",
  "Grenache",
  "Malbec",
  "Tempranillo",
  "Sangiovese",
  "Pinot Gris",
  "Zinfandel",
  "Nebbiolo",
  "Chenin Blanc",
];

if (process.env.NODE_ENV !== "production") {
  const knownGrapeValues = new Set(GRAPE_VARIETIES.map((g) => g.value));
  for (const value of POPULAR_GRAPE_VALUES) {
    if (!knownGrapeValues.has(value)) {
      throw new Error(`wineReferenceData: POPULAR_GRAPE_VALUES references unknown grape "${value}"`);
    }
  }
}

/**
 * Reorders a (possibly already style-filtered) grape list so the curated
 * POPULAR_GRAPE_VALUES lead, in that popularity order, followed by every
 * remaining grape in its existing (alphabetical) order. Used only by
 * *registration* dropdowns (tasting bottle + cellar bottle forms, via
 * WineIdentityFields) — never blind-guess entry, where an unbiased
 * alphabetical list matters more than convenience. A popular value absent
 * from `list` (e.g. filtered out by wine style) is simply skipped.
 */
export function grapeVarietiesPopularFirst<T extends { value: string }>(list: T[]): T[] {
  const byValue = new Map(list.map((g) => [g.value, g]));
  const popular = POPULAR_GRAPE_VALUES.map((v) => byValue.get(v)).filter(
    (g): g is T => g !== undefined
  );
  const popularValues = new Set(popular.map((g) => g.value));
  const rest = list.filter((g) => !popularValues.has(g.value));
  return [...popular, ...rest];
}

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
  // Regional synonyms for the same grape, added for grape-entry assistance
  // (see lib/grapeAssistance.ts) — kept as aliases of one canonical entry
  // rather than duplicate GRAPE_VARIETIES rows, matching the pattern above.
  Garnacha: "Grenache",
  "Garnacha Blanca": "Grenache Blanc",
  Mazuelo: "Carignan",
  Cariñena: "Carignan",
  "Tinta Roriz": "Tempranillo",
  Aragonez: "Tempranillo",
  Mataro: "Mourvèdre",
  "Moscato Bianco": "Muscat",
  "Muscat Blanc à Petits Grains": "Muscat",
  "Palomino Fino": "Palomino",
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

const GRAPE_SKIN_BY_CANONICAL_VALUE = new Map<string, GrapeSkin>(
  GRAPE_VARIETIES.map((g) => [g.value, g.skin])
);

/** The skin colour of a known standard grape/alias, or null for an unrecognised (e.g. custom "Other grape") value. */
export function grapeSkin(raw: string): GrapeSkin | null {
  const known = resolveKnownGrapeDisplayName(raw);
  return known ? (GRAPE_SKIN_BY_CANONICAL_VALUE.get(known) ?? null) : null;
}

/**
 * Grape-entry assistance (see README "Grape-entry assistance"): the
 * single-variety dropdown options for a given wine style. White/Red filter
 * to only that skin colour; every other style (Bubbles, Sweet, Other, or no
 * style chosen yet) can legitimately use either colour, so both are shown.
 * "Other grape" is appended separately by GrapeBlendField — it is a UI
 * fallback, never a standard grape, so it's never part of this list.
 */
export function singleGrapeVarietyOptionsForStyle(wineStyle?: string): GrapeVarietyOption[] {
  if (wineStyle === "white") return GRAPE_VARIETIES.filter((g) => g.skin === "white");
  if (wineStyle === "red") return GRAPE_VARIETIES.filter((g) => g.skin === "red");
  return GRAPE_VARIETIES;
}

/**
 * Same as `singleGrapeVarietyOptionsForStyle`, but never drops a
 * `currentValue` that's already selected, even if it's the wrong colour for
 * `wineStyle` — used by a blind guess form's grape dropdown (see README
 * "Grape-entry assistance" — "Blind guess forms"), where a participant's
 * prior guess must stay visible/selectable in a native `<select>` and is
 * never silently cleared just because it doesn't match the (private) actual
 * wine's colour hint. Prepended rather than inserted in place, since where
 * it "should" sort among a differently-filtered list is undefined. A no-op
 * when `currentValue` is blank or already in the filtered list.
 */
export function singleGrapeVarietyOptionsPreservingCurrent(
  wineStyle: string | undefined,
  currentValue: string
): GrapeVarietyOption[] {
  const filtered = singleGrapeVarietyOptionsForStyle(wineStyle);
  if (!currentValue || filtered.some((g) => g.value === currentValue)) {
    return filtered;
  }
  const preserved = GRAPE_VARIETIES.find((g) => g.value === currentValue);
  return preserved ? [preserved, ...filtered] : filtered;
}

/**
 * True unless `grapeName` is a known standard grape whose skin colour
 * conflicts with a White/Red wine style — used only to decide whether an
 * existing single-grape selection must be cleared after a style change (see
 * lib/grapeAssistance.ts). An unrecognised value (a custom "Other grape"
 * entry, or blank) has no known colour, so it is always treated as
 * compatible — this feature never guesses at a custom grape's colour.
 * Every style other than White/Red allows either colour.
 */
export function isGrapeColorCompatibleWithStyle(grapeName: string, wineStyle: string): boolean {
  const skin = grapeSkin(grapeName);
  if (!skin) return true;
  if (wineStyle === "white") return skin === "white";
  if (wineStyle === "red") return skin === "red";
  return true;
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

// ---------------------------------------------------------------------------
// "Other grape" — free-text single-variety entry for a grape not on the
// curated GRAPE_VARIETIES list. A custom value is still exactly one variety
// (never split/blended) — this is deliberately unrelated to the blend-mode
// free text path above (parseOtherGrapesText/combineBlendComponents).
// ---------------------------------------------------------------------------

export const MAX_OTHER_GRAPE_LENGTH = 80;

// Comma/slash/ampersand/semicolon signal an attempt to enter more than one
// grape into the single-variety field — the contributor should use Blend
// mode instead (see lib/validation.ts's OTHER_GRAPE_MULTI_VARIETY_ERROR).
const MULTI_VARIETY_DELIMITER_REGEX = /[,/&;]/;

// Plain Latin letters plus the Latin-1 Supplement/Latin Extended-A accented
// range (covers French/German/Italian/Spanish/Portuguese/Hungarian/Czech/
// Polish etc. grape names, e.g. "Mondeuse Blanche" or "Kéknyelű") and
// combining marks (decomposed accents, matching lib/normalize.ts), plus
// spaces, hyphens, and straight/curly apostrophes — deliberately not an
// ASCII-only pattern. No `u` flag: this tsconfig's default target predates
// Unicode property escape support.
const OTHER_GRAPE_NAME_REGEX = /^[A-Za-zÀ-ſ̀-ͯ'’ -]+$/;

export function hasMultiVarietyDelimiter(value: string): boolean {
  return MULTI_VARIETY_DELIMITER_REGEX.test(value);
}

/**
 * True for a plausible single custom grape name: non-blank, within the
 * length cap, letters/spaces/hyphens/apostrophes only. Does not check for
 * multi-variety delimiters — see `hasMultiVarietyDelimiter`, checked
 * separately so its more specific error message can take priority.
 */
export function isValidOtherGrapeName(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_OTHER_GRAPE_LENGTH &&
    OTHER_GRAPE_NAME_REGEX.test(trimmed)
  );
}

/**
 * True when a single-variety grape value should be presented as "Other
 * grape" in the UI (dropdown shows that sentinel option, with a custom text
 * input showing this value) rather than as a curated dropdown selection —
 * i.e. it's non-blank and not one of GRAPE_VARIETIES or its aliases. Shared
 * by every place that loads a stored/drafted single-variety value into
 * editable form state (bottle registration, cellar, guess drafts) so the
 * derivation can never drift between them.
 */
export function isCustomSingleGrape(mode: string, grapeBlend: string): boolean {
  return mode === "single" && grapeBlend.trim() !== "" && !isKnownGrapeVariety(grapeBlend);
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
