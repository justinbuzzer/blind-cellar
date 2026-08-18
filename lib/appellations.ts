import { normalizeText } from "./normalize";

/**
 * Curated Region -> Appellation data (v1) — see README "Region and
 * Appellation". This is a deliberately small, hand-picked set of
 * well-known country/region pairs, NOT a comprehensive or legal wine
 * appellation database. Adding a new pair is safe and additive: add a
 * `country -> region -> appellation[]` entry here (region must exactly match
 * an existing `REGIONS_BY_COUNTRY` entry in wineReferenceData.ts, adding one
 * there first if needed), then mirror the same entry in the
 * `is_valid_appellation` function in supabase/schema.sql so the server
 * enforces the same list the client offers — see SUPABASE_SETUP.md "Adding a
 * new supported region/appellation pair" for the full steps.
 *
 * Appellation never drives grape selection, blend behaviour, or scoring in
 * this version — it is purely an optional, additional piece of wine
 * identity, shown and hidden exactly where region/country already are.
 *
 * Two region keys below were deliberately adjusted from the most casual
 * spelling of the wine region to match this app's own existing canonical
 * `REGIONS_BY_COUNTRY` vocabulary, so the field actually appears for the
 * real dropdown value a contributor selects:
 * - Spain's Rioja pair is keyed to "La Rioja" (this app's existing region
 *   name), not "Rioja".
 * - "Jerez" did not previously exist as a selectable Spain region at all
 *   (only the broader "Andalucía") — added as a new, additive region option
 *   so the Jerez/sherry appellation pair is reachable.
 * Australia's existing region list was already at individual-GI granularity
 * (Barossa Valley, McLaren Vale, ...) rather than state level, so the four
 * Australian state-level regions this feature calls for
 * (South Australia/Victoria/Western Australia/New South Wales) were added
 * as new, additive region options alongside the existing ones — nothing was
 * removed or renamed, so historic bottles keep whatever region they had.
 */
const APPELLATIONS_BY_COUNTRY_REGION: Record<string, Record<string, string[]>> = {
  France: {
    Burgundy: [
      "Chablis",
      "Petit Chablis",
      "Chablis Premier Cru",
      "Chablis Grand Cru",
      "Bourgogne",
      "Bourgogne Aligoté",
      "Bourgogne Côte d'Or",
      "Côte de Nuits-Villages",
      "Côte de Beaune-Villages",
      "Marsannay",
      "Fixin",
      "Gevrey-Chambertin",
      "Morey-Saint-Denis",
      "Chambolle-Musigny",
      "Vougeot",
      "Vosne-Romanée",
      "Nuits-Saint-Georges",
      "Pernand-Vergelesses",
      "Aloxe-Corton",
      "Savigny-lès-Beaune",
      "Chorey-lès-Beaune",
      "Beaune",
      "Pommard",
      "Volnay",
      "Monthelie",
      "Meursault",
      "Puligny-Montrachet",
      "Chassagne-Montrachet",
      "Saint-Aubin",
      "Santenay",
      "Maranges",
      "Mercurey",
      "Givry",
      "Rully",
      "Montagny",
      "Mâcon",
      "Mâcon-Villages",
      "Pouilly-Fuissé",
      "Pouilly-Vinzelles",
      "Pouilly-Loché",
      "Saint-Véran",
      "Viré-Clessé",
    ],
    Beaujolais: [
      "Beaujolais",
      "Beaujolais-Villages",
      "Brouilly",
      "Côte de Brouilly",
      "Chénas",
      "Chiroubles",
      "Fleurie",
      "Juliénas",
      "Morgon",
      "Moulin-à-Vent",
      "Régnié",
      "Saint-Amour",
    ],
    Bordeaux: [
      "Bordeaux",
      "Bordeaux Supérieur",
      "Médoc",
      "Haut-Médoc",
      "Margaux",
      "Moulis-en-Médoc",
      "Listrac-Médoc",
      "Saint-Estèphe",
      "Pauillac",
      "Saint-Julien",
      "Graves",
      "Pessac-Léognan",
      "Pomerol",
      "Saint-Émilion",
      "Saint-Émilion Grand Cru",
      "Fronsac",
      "Canon-Fronsac",
      "Lalande-de-Pomerol",
      "Sauternes",
      "Barsac",
      "Cadillac",
      "Cérons",
      "Sainte-Croix-du-Mont",
    ],
    Champagne: ["Champagne", "Coteaux Champenois", "Rosé des Riceys"],
    "Loire Valley": [
      "Muscadet Sèvre et Maine",
      "Sancerre",
      "Pouilly-Fumé",
      "Menetou-Salon",
      "Quincy",
      "Reuilly",
      "Touraine",
      "Vouvray",
      "Montlouis-sur-Loire",
      "Saumur",
      "Saumur-Champigny",
      "Chinon",
      "Bourgueil",
      "Saint-Nicolas-de-Bourgueil",
      "Anjou",
      "Savennières",
      "Coteaux du Layon",
      "Bonnezeaux",
      "Quarts de Chaume",
    ],
    "Rhône Valley": [
      "Côte-Rôtie",
      "Condrieu",
      "Château-Grillet",
      "Saint-Joseph",
      "Crozes-Hermitage",
      "Hermitage",
      "Cornas",
      "Saint-Péray",
      "Côtes du Rhône",
      "Côtes du Rhône Villages",
      "Châteauneuf-du-Pape",
      "Gigondas",
      "Vacqueyras",
      "Beaumes-de-Venise",
      "Tavel",
      "Lirac",
      "Rasteau",
      "Vinsobres",
      "Cairanne",
    ],
    Alsace: ["Alsace", "Alsace Grand Cru", "Crémant d'Alsace"],
    Provence: [
      "Côtes de Provence",
      "Coteaux d'Aix-en-Provence",
      "Coteaux Varois en Provence",
      "Bandol",
      "Cassis",
      "Palette",
      "Bellet",
    ],
  },
  Italy: {
    Piedmont: [
      "Barolo",
      "Barbaresco",
      "Langhe",
      "Roero",
      "Nebbiolo d'Alba",
      "Barbera d'Asti",
      "Barbera d'Alba",
      "Nizza",
      "Dolcetto d'Alba",
      "Dolcetto di Dogliani",
      "Dogliani",
      "Gavi",
      "Arneis",
      "Moscato d'Asti",
      "Asti",
      "Brachetto d'Acqui",
      "Gattinara",
      "Ghemme",
      "Carema",
      "Boca",
      "Lessona",
      "Bramaterra",
    ],
    Tuscany: [
      "Chianti",
      "Chianti Classico",
      "Brunello di Montalcino",
      "Rosso di Montalcino",
      "Vino Nobile di Montepulciano",
      "Bolgheri",
      "Bolgheri Sassicaia",
      "Morellino di Scansano",
      "Carmignano",
      "Vernaccia di San Gimignano",
      "Vin Santo del Chianti",
    ],
    Veneto: [
      "Valpolicella",
      "Valpolicella Classico",
      "Valpolicella Ripasso",
      "Amarone della Valpolicella",
      "Recioto della Valpolicella",
      "Soave",
      "Soave Classico",
      "Bardolino",
      "Lugana",
      "Prosecco",
      "Conegliano Valdobbiadene Prosecco",
    ],
    Sicily: ["Etna", "Cerasuolo di Vittoria", "Marsala", "Noto", "Menfi"],
    Campania: [
      "Taurasi",
      "Fiano di Avellino",
      "Greco di Tufo",
      "Aglianico del Taburno",
      "Falerno del Massico",
    ],
  },
  Spain: {
    // See file header: this app's canonical Spain region for Rioja is "La Rioja".
    "La Rioja": ["Rioja", "Rioja Alta", "Rioja Alavesa", "Rioja Oriental"],
    "Ribera del Duero": ["Ribera del Duero"],
    Priorat: ["Priorat"],
    "Rías Baixas": [
      "Rías Baixas",
      "Val do Salnés",
      "O Rosal",
      "Condado do Tea",
      "Soutomaior",
      "Ribeira do Ulla",
    ],
    // See file header: "Jerez" is a newly-added region option.
    Jerez: ["Jerez-Xérès-Sherry", "Manzanilla-Sanlúcar de Barrameda"],
  },
  Portugal: {
    Douro: ["Douro", "Porto"],
    Dão: ["Dão"],
    Alentejo: ["Alentejo"],
  },
  Germany: {
    Mosel: ["Mosel"],
    Rheingau: ["Rheingau"],
    Pfalz: ["Pfalz"],
  },
  Austria: {
    Wachau: ["Wachau"],
    Kamptal: ["Kamptal"],
    Kremstal: ["Kremstal"],
  },
  "United States": {
    // Willamette Valley is deliberately excluded here — it's in Oregon, not California.
    California: [
      "Napa Valley",
      "Sonoma County",
      "Russian River Valley",
      "Sonoma Coast",
      "Carneros",
      "Santa Barbara County",
      "Santa Maria Valley",
      "Santa Ynez Valley",
      "Sta. Rita Hills",
      "Paso Robles",
    ],
    Oregon: [
      "Willamette Valley",
      "Dundee Hills",
      "Eola-Amity Hills",
      "Yamhill-Carlton",
      "Chehalem Mountains",
      "McMinnville",
      "Ribbon Ridge",
    ],
    Washington: [
      "Columbia Valley",
      "Walla Walla Valley",
      "Red Mountain",
      "Yakima Valley",
      "Horse Heaven Hills",
    ],
  },
  Australia: {
    // See file header: these four region keys are newly-added, state-level
    // region options alongside this app's existing individual-GI regions.
    "South Australia": [
      "Barossa Valley",
      "Eden Valley",
      "McLaren Vale",
      "Clare Valley",
      "Coonawarra",
      "Adelaide Hills",
      "Padthaway",
      "Langhorne Creek",
    ],
    Victoria: [
      "Yarra Valley",
      "Mornington Peninsula",
      "Heathcote",
      "Rutherglen",
      "Beechworth",
      "Macedon Ranges",
    ],
    "Western Australia": ["Margaret River", "Great Southern", "Swan Valley"],
    "New South Wales": ["Hunter Valley", "Riverina", "Orange", "Canberra District"],
  },
  "New Zealand": {
    Marlborough: ["Marlborough", "Wairau Valley", "Awatere Valley", "Southern Valleys"],
    "Central Otago": [
      "Central Otago",
      "Bannockburn",
      "Gibbston",
      "Bendigo",
      "Alexandra",
      "Cromwell Basin",
    ],
    "Hawke's Bay": ["Hawke's Bay", "Gimblett Gravels", "Bridge Pa Triangle"],
  },
};

function lookupKey(country: string, region: string): string {
  return `${normalizeText(country)}|${normalizeText(region)}`;
}

const APPELLATIONS_BY_NORMALIZED_KEY = new Map<string, string[]>();
for (const [country, regions] of Object.entries(APPELLATIONS_BY_COUNTRY_REGION)) {
  for (const [region, appellations] of Object.entries(regions)) {
    APPELLATIONS_BY_NORMALIZED_KEY.set(lookupKey(country, region), appellations);
  }
}

if (process.env.NODE_ENV !== "production") {
  for (const [country, regions] of Object.entries(APPELLATIONS_BY_COUNTRY_REGION)) {
    for (const [region, appellations] of Object.entries(regions)) {
      const seen = new Set<string>();
      for (const appellation of appellations) {
        const key = normalizeText(appellation);
        if (seen.has(key)) {
          throw new Error(
            `lib/appellations: duplicate appellation "${appellation}" for ${country} / ${region}`
          );
        }
        seen.add(key);
      }
    }
  }
}

/** Every curated appellation for a country/region pair, or `[]` if the pair isn't supported. Inputs are trimmed and matched case-insensitively. */
export function getAppellations(country: string, region: string): string[] {
  return APPELLATIONS_BY_NORMALIZED_KEY.get(lookupKey(country, region)) ?? [];
}

/** Whether the Appellation field should be shown at all for this country/region pair. */
export function hasAppellations(country: string, region: string): boolean {
  return APPELLATIONS_BY_NORMALIZED_KEY.has(lookupKey(country, region));
}

/**
 * An appellation is always optional, so a blank value is always valid
 * regardless of country/region. A non-blank value must be one of the
 * curated options for that exact country/region pair — including when the
 * pair itself has no curated list at all (`getAppellations` returning `[]`
 * makes that case fail here automatically, matching "unsupported pair must
 * have a null appellation").
 */
export function isValidAppellation(country: string, region: string, appellation: string): boolean {
  if (!appellation.trim()) return true;
  const normalizedTarget = normalizeText(appellation);
  return getAppellations(country, region).some((a) => normalizeText(a) === normalizedTarget);
}

/**
 * Concise "Appellation, Region, Country" display string for space-limited
 * contexts (tasting report rankings, the wine ledger, the cellar list) — see
 * README "Region and Appellation" — "Compact lists". Missing values are
 * omitted cleanly, and a region that happens to equal the appellation's
 * display text (e.g. an unsplit "Champagne") is never duplicated.
 */
export function compactWineLocationLabel(wine: {
  appellation?: string | null;
  region?: string | null;
  country?: string | null;
}): string {
  const parts: string[] = [];
  const appellation = wine.appellation?.trim();
  const region = wine.region?.trim();
  const country = wine.country?.trim();

  if (appellation) parts.push(appellation);
  if (region && normalizeText(region) !== normalizeText(appellation ?? "")) parts.push(region);
  if (country) parts.push(country);

  return parts.join(", ");
}

/**
 * "Producer — Wine / cuvée Vintage" display string for a revealed wine —
 * used wherever a report identifies a wine by its real name rather than its
 * anonymous bottle code (e.g. "Bottle 4"), matching RevealedWineIdentity's
 * heading convention. Vintage is appended only when present, since an NV
 * wine's `vintage` is the literal string "NV" and reads fine appended as-is.
 */
export function wineDisplayName(wine: {
  producer: string;
  wineName: string;
  vintage?: string | null;
}): string {
  const base = `${wine.producer} — ${wine.wineName}`;
  return wine.vintage ? `${base} ${wine.vintage}` : base;
}
