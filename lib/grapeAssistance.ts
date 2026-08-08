import { normalizeText } from "./normalize";
import { isGrapeColorCompatibleWithStyle, isKnownGrapeVariety } from "./wineReferenceData";
import { GrapeBlendMode } from "@/types/tasting";

/**
 * Grape-entry assistance (see README "Grape-entry assistance"): a curated,
 * intentionally incomplete v1 shortcut that pre-fills a bottle's grape/blend
 * from its Country + Region + Appellation + Wine style, wherever that
 * combination unambiguously implies one. This is an entry-speed convenience,
 * never a wine-law database and never a scoring input — every value it sets
 * is stored and validated exactly like a manually chosen one (see
 * lib/useGrapeAssistance.ts for the auto/manual/empty state machine that
 * decides *when* to apply a match, and GrapeBlendField for the White/Red
 * skin-colour dropdown filtering this module also powers).
 */

export interface GrapeAssistanceMatch {
  kind: "single" | "blend";
  grapes: string[];
}

export interface GrapeAssistanceKey {
  country: string;
  region: string;
  appellation?: string;
  wineStyle?: string;
}

interface MappingEntry {
  country: string;
  region: string;
  appellation?: string;
  wineStyle?: string;
  kind: "single" | "blend";
  grapes: string[];
}

function single(
  country: string,
  region: string,
  grape: string,
  extra?: { appellation?: string; wineStyle?: string }
): MappingEntry {
  return { country, region, kind: "single", grapes: [grape], ...extra };
}

function blend(
  country: string,
  region: string,
  grapes: string[],
  extra?: { appellation?: string; wineStyle?: string }
): MappingEntry {
  return { country, region, kind: "blend", grapes, ...extra };
}

// ---------------------------------------------------------------------------
// Curated v1 mapping data. Every country/region/appellation string below is
// this app's own existing canonical value (see lib/wineReferenceData.ts's
// REGIONS_BY_COUNTRY and lib/appellations.ts) — nothing here is a new
// vocabulary value. Deliberately incomplete: an appellation/region not
// listed here simply has no automatic selection, which is the correct,
// intentional behaviour for a curated shortcut rather than a wine-law
// database (see README "Grape-entry assistance" — "What this does not do").
// ---------------------------------------------------------------------------
const MAPPING_ENTRIES: MappingEntry[] = [
  // --- France / Burgundy -----------------------------------------------
  ...[
    "Chablis",
    "Petit Chablis",
    "Chablis Premier Cru",
    "Chablis Grand Cru",
    "Mâcon",
    "Mâcon-Villages",
    "Pouilly-Fuissé",
    "Pouilly-Vinzelles",
    "Pouilly-Loché",
    "Saint-Véran",
    "Viré-Clessé",
    "Montagny",
    "Meursault",
    "Puligny-Montrachet",
  ].map((appellation) => single("France", "Burgundy", "Chardonnay", { appellation })),
  single("France", "Burgundy", "Aligoté", { appellation: "Bourgogne Aligoté" }),
  single("France", "Burgundy", "Chardonnay", { appellation: "Mercurey", wineStyle: "white" }),
  single("France", "Burgundy", "Chardonnay", { appellation: "Givry", wineStyle: "white" }),
  single("France", "Burgundy", "Chardonnay", { appellation: "Rully", wineStyle: "white" }),
  single("France", "Burgundy", "Chardonnay", { appellation: "Chassagne-Montrachet", wineStyle: "white" }),
  single("France", "Burgundy", "Chardonnay", { appellation: "Saint-Aubin", wineStyle: "white" }),
  single("France", "Burgundy", "Chardonnay", { appellation: "Pernand-Vergelesses", wineStyle: "white" }),
  ...[
    "Fixin",
    "Gevrey-Chambertin",
    "Morey-Saint-Denis",
    "Chambolle-Musigny",
    "Vougeot",
    "Vosne-Romanée",
    "Nuits-Saint-Georges",
    "Côte de Nuits-Villages",
    "Aloxe-Corton",
    "Savigny-lès-Beaune",
    "Chorey-lès-Beaune",
    "Beaune",
    "Pommard",
    "Volnay",
    "Monthelie",
    "Santenay",
    "Maranges",
  ].map((appellation) => single("France", "Burgundy", "Pinot Noir", { appellation })),
  single("France", "Burgundy", "Pinot Noir", { appellation: "Marsannay", wineStyle: "red" }),
  single("France", "Burgundy", "Pinot Noir", { appellation: "Côte de Beaune-Villages", wineStyle: "red" }),
  single("France", "Burgundy", "Pinot Noir", { appellation: "Pernand-Vergelesses", wineStyle: "red" }),
  single("France", "Burgundy", "Pinot Noir", { appellation: "Mercurey", wineStyle: "red" }),
  single("France", "Burgundy", "Pinot Noir", { appellation: "Givry", wineStyle: "red" }),
  single("France", "Burgundy", "Pinot Noir", { appellation: "Rully", wineStyle: "red" }),
  single("France", "Burgundy", "Pinot Noir", { appellation: "Chassagne-Montrachet", wineStyle: "red" }),
  single("France", "Burgundy", "Pinot Noir", { appellation: "Saint-Aubin", wineStyle: "red" }),
  single("France", "Burgundy", "Chardonnay", { wineStyle: "white" }),
  single("France", "Burgundy", "Pinot Noir", { wineStyle: "red" }),

  // --- France / Beaujolais -----------------------------------------------
  ...[
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
  ].map((appellation) => single("France", "Beaujolais", "Gamay", { appellation })),
  single("France", "Beaujolais", "Gamay"),

  // --- France / Bordeaux ---------------------------------------------------
  blend("France", "Bordeaux", ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], { wineStyle: "red" }),
  ...[
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
  ].map((appellation) =>
    blend("France", "Bordeaux", ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], {
      appellation,
      wineStyle: "red",
    })
  ),
  ...["Pomerol", "Saint-Émilion", "Saint-Émilion Grand Cru", "Fronsac", "Canon-Fronsac", "Lalande-de-Pomerol"].map(
    (appellation) => blend("France", "Bordeaux", ["Merlot", "Cabernet Franc"], { appellation, wineStyle: "red" })
  ),
  blend("France", "Bordeaux", ["Sauvignon Blanc", "Sémillon"], { wineStyle: "white" }),
  blend("France", "Bordeaux", ["Sauvignon Blanc", "Sémillon"], { appellation: "Graves", wineStyle: "white" }),
  blend("France", "Bordeaux", ["Sauvignon Blanc", "Sémillon"], {
    appellation: "Pessac-Léognan",
    wineStyle: "white",
  }),
  ...["Sauternes", "Barsac", "Cadillac", "Cérons", "Sainte-Croix-du-Mont"].map((appellation) =>
    blend("France", "Bordeaux", ["Sémillon", "Sauvignon Blanc"], { appellation })
  ),

  // --- France / Champagne --------------------------------------------------
  blend("France", "Champagne", ["Chardonnay", "Pinot Noir", "Pinot Meunier"], { appellation: "Champagne" }),
  blend("France", "Champagne", ["Chardonnay", "Pinot Noir", "Pinot Meunier"], {
    appellation: "Coteaux Champenois",
    wineStyle: "white",
  }),
  blend("France", "Champagne", ["Chardonnay", "Pinot Noir", "Pinot Meunier"], {
    appellation: "Coteaux Champenois",
    wineStyle: "red",
  }),
  single("France", "Champagne", "Pinot Noir", { appellation: "Rosé des Riceys" }),
  blend("France", "Champagne", ["Chardonnay", "Pinot Noir", "Pinot Meunier"], { wineStyle: "bubbles" }),

  // --- France / Loire Valley -------------------------------------------
  single("France", "Loire Valley", "Melon de Bourgogne", { appellation: "Muscadet Sèvre et Maine" }),
  ...["Sancerre", "Pouilly-Fumé", "Menetou-Salon", "Quincy"].map((appellation) =>
    single("France", "Loire Valley", "Sauvignon Blanc", { appellation })
  ),
  single("France", "Loire Valley", "Sauvignon Blanc", { appellation: "Reuilly", wineStyle: "white" }),
  single("France", "Loire Valley", "Pinot Noir", { appellation: "Reuilly", wineStyle: "red" }),
  single("France", "Loire Valley", "Sauvignon Blanc", { appellation: "Touraine", wineStyle: "white" }),
  single("France", "Loire Valley", "Chenin Blanc", { appellation: "Vouvray" }),
  single("France", "Loire Valley", "Chenin Blanc", { appellation: "Montlouis-sur-Loire" }),
  single("France", "Loire Valley", "Chenin Blanc", { appellation: "Saumur", wineStyle: "white" }),
  single("France", "Loire Valley", "Cabernet Franc", { appellation: "Saumur-Champigny" }),
  ...["Chinon", "Bourgueil", "Saint-Nicolas-de-Bourgueil"].map((appellation) =>
    single("France", "Loire Valley", "Cabernet Franc", { appellation })
  ),
  ...["Savennières", "Coteaux du Layon", "Bonnezeaux", "Quarts de Chaume"].map((appellation) =>
    single("France", "Loire Valley", "Chenin Blanc", { appellation })
  ),

  // --- France / Rhône Valley -----------------------------------------------
  blend("France", "Rhône Valley", ["Syrah", "Viognier"], { appellation: "Côte-Rôtie" }),
  single("France", "Rhône Valley", "Viognier", { appellation: "Condrieu" }),
  single("France", "Rhône Valley", "Viognier", { appellation: "Château-Grillet" }),
  single("France", "Rhône Valley", "Syrah", { appellation: "Saint-Joseph", wineStyle: "red" }),
  blend("France", "Rhône Valley", ["Marsanne", "Roussanne"], { appellation: "Saint-Joseph", wineStyle: "white" }),
  single("France", "Rhône Valley", "Syrah", { appellation: "Crozes-Hermitage", wineStyle: "red" }),
  blend("France", "Rhône Valley", ["Marsanne", "Roussanne"], {
    appellation: "Crozes-Hermitage",
    wineStyle: "white",
  }),
  single("France", "Rhône Valley", "Syrah", { appellation: "Hermitage", wineStyle: "red" }),
  blend("France", "Rhône Valley", ["Marsanne", "Roussanne"], { appellation: "Hermitage", wineStyle: "white" }),
  single("France", "Rhône Valley", "Syrah", { appellation: "Cornas" }),
  blend("France", "Rhône Valley", ["Marsanne", "Roussanne"], { appellation: "Saint-Péray" }),
  ...["Côtes du Rhône", "Côtes du Rhône Villages", "Châteauneuf-du-Pape", "Vacqueyras", "Rasteau", "Cairanne"].map(
    (appellation) =>
      blend("France", "Rhône Valley", ["Grenache", "Syrah", "Mourvèdre"], { appellation, wineStyle: "red" })
  ),
  blend("France", "Rhône Valley", ["Grenache Blanc", "Roussanne", "Clairette"], {
    appellation: "Châteauneuf-du-Pape",
    wineStyle: "white",
  }),
  blend("France", "Rhône Valley", ["Grenache", "Syrah", "Mourvèdre"], { appellation: "Gigondas" }),
  blend("France", "Rhône Valley", ["Grenache Blanc", "Clairette", "Roussanne"], {
    appellation: "Vacqueyras",
    wineStyle: "white",
  }),
  blend("France", "Rhône Valley", ["Grenache", "Syrah", "Mourvèdre"], {
    appellation: "Beaumes-de-Venise",
    wineStyle: "red",
  }),
  single("France", "Rhône Valley", "Muscat", { appellation: "Beaumes-de-Venise", wineStyle: "white" }),
  blend("France", "Rhône Valley", ["Grenache", "Cinsault", "Clairette"], { appellation: "Tavel" }),
  blend("France", "Rhône Valley", ["Grenache", "Syrah", "Mourvèdre"], { appellation: "Lirac", wineStyle: "red" }),
  blend("France", "Rhône Valley", ["Grenache Blanc", "Clairette", "Roussanne"], {
    appellation: "Lirac",
    wineStyle: "white",
  }),
  blend("France", "Rhône Valley", ["Grenache", "Syrah", "Mourvèdre"], { appellation: "Vinsobres" }),
  blend("France", "Rhône Valley", ["Grenache Blanc", "Clairette", "Roussanne"], {
    appellation: "Cairanne",
    wineStyle: "white",
  }),

  // --- France / Alsace -------------------------------------------------
  blend("France", "Alsace", ["Pinot Blanc", "Chardonnay", "Pinot Gris", "Riesling", "Pinot Noir"], {
    appellation: "Crémant d'Alsace",
  }),

  // --- France / Provence -------------------------------------------------
  blend("France", "Provence", ["Grenache", "Cinsault", "Syrah"], { appellation: "Côtes de Provence" }),
  blend("France", "Provence", ["Grenache", "Syrah", "Cinsault"], { appellation: "Coteaux d'Aix-en-Provence" }),
  blend("France", "Provence", ["Grenache", "Cinsault", "Syrah"], { appellation: "Coteaux Varois en Provence" }),
  blend("France", "Provence", ["Mourvèdre", "Grenache", "Cinsault"], { appellation: "Bandol", wineStyle: "red" }),
  blend("France", "Provence", ["Marsanne", "Clairette"], { appellation: "Cassis" }),
  blend("France", "Provence", ["Mourvèdre", "Grenache", "Cinsault"], { appellation: "Palette" }),
  blend("France", "Provence", ["Rolle", "Chardonnay"], { appellation: "Bellet", wineStyle: "white" }),
  blend("France", "Provence", ["Braquet", "Folle Noire"], { appellation: "Bellet", wineStyle: "red" }),

  // --- Italy / Piedmont ------------------------------------------------
  single("Italy", "Piedmont", "Nebbiolo", { appellation: "Barolo" }),
  single("Italy", "Piedmont", "Nebbiolo", { appellation: "Barbaresco" }),
  single("Italy", "Piedmont", "Nebbiolo", { appellation: "Langhe", wineStyle: "red" }),
  single("Italy", "Piedmont", "Nebbiolo", { appellation: "Roero", wineStyle: "red" }),
  single("Italy", "Piedmont", "Nebbiolo", { appellation: "Nebbiolo d'Alba" }),
  single("Italy", "Piedmont", "Barbera", { appellation: "Barbera d'Asti" }),
  single("Italy", "Piedmont", "Barbera", { appellation: "Barbera d'Alba" }),
  single("Italy", "Piedmont", "Barbera", { appellation: "Nizza" }),
  single("Italy", "Piedmont", "Dolcetto", { appellation: "Dolcetto d'Alba" }),
  single("Italy", "Piedmont", "Dolcetto", { appellation: "Dolcetto di Dogliani" }),
  single("Italy", "Piedmont", "Dolcetto", { appellation: "Dogliani" }),
  single("Italy", "Piedmont", "Cortese", { appellation: "Gavi" }),
  // Roero + White -> Arneis is deliberately not mapped: "Arneis" is already
  // one of this app's curated Piedmont appellation values (see
  // lib/appellations.ts), and this feature must never add a grape whose
  // name collides with an existing appellation value (see
  // lib/__tests__/appellations.test.ts's grape/appellation collision guard)
  // — appellation data is explicitly out of scope to change for this
  // feature, so the grape side yields instead. See README.
  single("Italy", "Piedmont", "Muscat", { appellation: "Moscato d'Asti" }),
  single("Italy", "Piedmont", "Muscat", { appellation: "Asti" }),
  single("Italy", "Piedmont", "Brachetto", { appellation: "Brachetto d'Acqui" }),
  ...["Gattinara", "Ghemme", "Carema", "Boca", "Lessona", "Bramaterra"].map((appellation) =>
    single("Italy", "Piedmont", "Nebbiolo", { appellation })
  ),

  // --- Italy / Tuscany ---------------------------------------------------
  blend("Italy", "Tuscany", ["Sangiovese", "Canaiolo", "Colorino"], { appellation: "Chianti" }),
  blend("Italy", "Tuscany", ["Sangiovese", "Canaiolo", "Colorino"], { appellation: "Chianti Classico" }),
  single("Italy", "Tuscany", "Sangiovese", { appellation: "Brunello di Montalcino" }),
  single("Italy", "Tuscany", "Sangiovese", { appellation: "Rosso di Montalcino" }),
  blend("Italy", "Tuscany", ["Sangiovese", "Canaiolo"], { appellation: "Vino Nobile di Montepulciano" }),
  blend("Italy", "Tuscany", ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], {
    appellation: "Bolgheri",
    wineStyle: "red",
  }),
  blend("Italy", "Tuscany", ["Cabernet Sauvignon", "Cabernet Franc"], { appellation: "Bolgheri Sassicaia" }),
  single("Italy", "Tuscany", "Sangiovese", { appellation: "Morellino di Scansano" }),
  blend("Italy", "Tuscany", ["Sangiovese", "Cabernet Sauvignon", "Cabernet Franc"], { appellation: "Carmignano" }),
  single("Italy", "Tuscany", "Vernaccia", { appellation: "Vernaccia di San Gimignano" }),
  blend("Italy", "Tuscany", ["Trebbiano", "Malvasia"], { appellation: "Vin Santo del Chianti" }),

  // --- Italy / Veneto ------------------------------------------------------
  ...[
    "Valpolicella",
    "Valpolicella Classico",
    "Valpolicella Ripasso",
    "Amarone della Valpolicella",
    "Recioto della Valpolicella",
    "Bardolino",
  ].map((appellation) => blend("Italy", "Veneto", ["Corvina", "Corvinone", "Rondinella"], { appellation })),
  single("Italy", "Veneto", "Garganega", { appellation: "Soave" }),
  single("Italy", "Veneto", "Garganega", { appellation: "Soave Classico" }),
  single("Italy", "Veneto", "Trebbiano di Soave", { appellation: "Lugana" }),
  single("Italy", "Veneto", "Glera", { appellation: "Prosecco" }),
  single("Italy", "Veneto", "Glera", { appellation: "Conegliano Valdobbiadene Prosecco" }),

  // --- Italy / Sicily ------------------------------------------------------
  single("Italy", "Sicily", "Nerello Mascalese", { appellation: "Etna", wineStyle: "red" }),
  single("Italy", "Sicily", "Carricante", { appellation: "Etna", wineStyle: "white" }),
  blend("Italy", "Sicily", ["Nero d'Avola", "Frappato"], { appellation: "Cerasuolo di Vittoria" }),
  blend("Italy", "Sicily", ["Grillo", "Catarratto", "Inzolia"], { appellation: "Marsala" }),
  single("Italy", "Sicily", "Nero d'Avola", { appellation: "Noto" }),

  // --- Italy / Campania ------------------------------------------------
  single("Italy", "Campania", "Aglianico", { appellation: "Taurasi" }),
  single("Italy", "Campania", "Fiano", { appellation: "Fiano di Avellino" }),
  single("Italy", "Campania", "Greco", { appellation: "Greco di Tufo" }),
  single("Italy", "Campania", "Aglianico", { appellation: "Aglianico del Taburno" }),
  blend("Italy", "Campania", ["Aglianico", "Piedirosso"], { appellation: "Falerno del Massico", wineStyle: "red" }),
  blend("Italy", "Campania", ["Falanghina", "Greco"], { appellation: "Falerno del Massico", wineStyle: "white" }),

  // --- Spain / Rioja (canonical region name: "La Rioja") ------------------
  ...["Rioja", "Rioja Alta", "Rioja Alavesa", "Rioja Oriental"].map((appellation) =>
    blend("Spain", "La Rioja", ["Tempranillo", "Grenache", "Graciano", "Carignan"], {
      appellation,
      wineStyle: "red",
    })
  ),
  ...["Rioja", "Rioja Alta", "Rioja Alavesa", "Rioja Oriental"].map((appellation) =>
    blend("Spain", "La Rioja", ["Viura", "Grenache Blanc", "Malvasia"], { appellation, wineStyle: "white" })
  ),

  // --- Spain / Ribera del Duero ---------------------------------------
  single("Spain", "Ribera del Duero", "Tempranillo", { appellation: "Ribera del Duero" }),
  single("Spain", "Ribera del Duero", "Tempranillo"),

  // --- Spain / Priorat -----------------------------------------------------
  blend("Spain", "Priorat", ["Grenache", "Carignan"], { appellation: "Priorat" }),
  blend("Spain", "Priorat", ["Grenache", "Carignan"]),

  // --- Spain / Rías Baixas -----------------------------------------------
  single("Spain", "Rías Baixas", "Albariño", { appellation: "Rías Baixas" }),
  single("Spain", "Rías Baixas", "Albariño", { appellation: "Val do Salnés" }),
  blend("Spain", "Rías Baixas", ["Albariño", "Loureira", "Caiño Blanco"], { appellation: "O Rosal" }),
  blend("Spain", "Rías Baixas", ["Albariño", "Treixadura", "Loureira"], { appellation: "Condado do Tea" }),
  single("Spain", "Rías Baixas", "Albariño", { appellation: "Soutomaior" }),
  single("Spain", "Rías Baixas", "Albariño", { appellation: "Ribeira do Ulla" }),

  // --- Spain / Jerez -------------------------------------------------------
  single("Spain", "Jerez", "Palomino", { appellation: "Jerez-Xérès-Sherry" }),
  single("Spain", "Jerez", "Palomino", { appellation: "Manzanilla-Sanlúcar de Barrameda" }),

  // --- Portugal / Douro ----------------------------------------------------
  blend("Portugal", "Douro", ["Touriga Nacional", "Touriga Franca", "Tempranillo"], {
    appellation: "Douro",
    wineStyle: "red",
  }),
  blend("Portugal", "Douro", ["Rabigato", "Viosinho", "Gouveio"], { appellation: "Douro", wineStyle: "white" }),
  blend("Portugal", "Douro", ["Touriga Nacional", "Touriga Franca", "Tempranillo"], {
    appellation: "Porto",
    wineStyle: "red",
  }),
  blend("Portugal", "Douro", ["Rabigato", "Viosinho", "Gouveio"], { appellation: "Porto", wineStyle: "white" }),

  // --- Portugal / Dão ------------------------------------------------------
  blend("Portugal", "Dão", ["Touriga Nacional", "Tempranillo", "Alfrocheiro"], {
    appellation: "Dão",
    wineStyle: "red",
  }),
  blend("Portugal", "Dão", ["Encruzado", "Bical", "Malvasia Fina"], { appellation: "Dão", wineStyle: "white" }),

  // --- Portugal / Alentejo -------------------------------------------------
  blend("Portugal", "Alentejo", ["Tempranillo", "Trincadeira", "Alicante Bouschet"], {
    appellation: "Alentejo",
    wineStyle: "red",
  }),
  blend("Portugal", "Alentejo", ["Antão Vaz", "Arinto", "Roupeiro"], {
    appellation: "Alentejo",
    wineStyle: "white",
  }),

  // --- Germany --------------------------------------------------------
  single("Germany", "Mosel", "Riesling", { appellation: "Mosel" }),
  single("Germany", "Mosel", "Riesling"),
  single("Germany", "Rheingau", "Riesling", { appellation: "Rheingau" }),
  single("Germany", "Rheingau", "Riesling"),

  // --- United States / California ---------------------------------------
  blend("United States", "California", ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], {
    appellation: "Napa Valley",
    wineStyle: "red",
  }),
  single("United States", "California", "Chardonnay", { appellation: "Napa Valley", wineStyle: "white" }),
  ...["Sonoma County", "Russian River Valley", "Sonoma Coast", "Carneros", "Santa Barbara County", "Santa Maria Valley", "Sta. Rita Hills"].flatMap(
    (appellation) => [
      single("United States", "California", "Pinot Noir", { appellation, wineStyle: "red" }),
      single("United States", "California", "Chardonnay", { appellation, wineStyle: "white" }),
    ]
  ),
  single("United States", "California", "Syrah", { appellation: "Santa Ynez Valley", wineStyle: "red" }),
  single("United States", "California", "Sauvignon Blanc", { appellation: "Santa Ynez Valley", wineStyle: "white" }),
  blend("United States", "California", ["Cabernet Sauvignon", "Syrah", "Grenache"], {
    appellation: "Paso Robles",
    wineStyle: "red",
  }),
  // Paso Robles + White is deliberately left unmapped — see README.

  // --- United States / Oregon -----------------------------------------
  ...[
    "Willamette Valley",
    "Dundee Hills",
    "Eola-Amity Hills",
    "Yamhill-Carlton",
    "Chehalem Mountains",
    "McMinnville",
    "Ribbon Ridge",
  ].map((appellation) => single("United States", "Oregon", "Pinot Noir", { appellation })),

  // --- United States / Washington --------------------------------------
  blend("United States", "Washington", ["Cabernet Sauvignon", "Merlot", "Syrah"], {
    appellation: "Columbia Valley",
    wineStyle: "red",
  }),
  single("United States", "Washington", "Riesling", { appellation: "Columbia Valley", wineStyle: "white" }),
  blend("United States", "Washington", ["Cabernet Sauvignon", "Merlot", "Syrah"], {
    appellation: "Walla Walla Valley",
    wineStyle: "red",
  }),
  blend("United States", "Washington", ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], {
    appellation: "Red Mountain",
  }),
  blend("United States", "Washington", ["Cabernet Sauvignon", "Merlot", "Syrah"], {
    appellation: "Yakima Valley",
    wineStyle: "red",
  }),
  single("United States", "Washington", "Riesling", { appellation: "Yakima Valley", wineStyle: "white" }),
  blend("United States", "Washington", ["Cabernet Sauvignon", "Merlot", "Syrah"], {
    appellation: "Horse Heaven Hills",
    wineStyle: "red",
  }),
  single("United States", "Washington", "Riesling", { appellation: "Horse Heaven Hills", wineStyle: "white" }),

  // --- Australia / South Australia --------------------------------------
  blend("Australia", "South Australia", ["Syrah", "Grenache", "Mourvèdre"], { appellation: "Barossa Valley" }),
  single("Australia", "South Australia", "Riesling", { appellation: "Eden Valley" }),
  blend("Australia", "South Australia", ["Syrah", "Grenache", "Mourvèdre"], { appellation: "McLaren Vale" }),
  single("Australia", "South Australia", "Riesling", { appellation: "Clare Valley" }),
  single("Australia", "South Australia", "Cabernet Sauvignon", { appellation: "Coonawarra" }),
  single("Australia", "South Australia", "Pinot Noir", { appellation: "Adelaide Hills", wineStyle: "red" }),
  single("Australia", "South Australia", "Sauvignon Blanc", { appellation: "Adelaide Hills", wineStyle: "white" }),
  single("Australia", "South Australia", "Cabernet Sauvignon", { appellation: "Padthaway" }),
  single("Australia", "South Australia", "Cabernet Sauvignon", { appellation: "Langhorne Creek" }),

  // --- Australia / Victoria -----------------------------------------------
  single("Australia", "Victoria", "Pinot Noir", { appellation: "Yarra Valley", wineStyle: "red" }),
  single("Australia", "Victoria", "Chardonnay", { appellation: "Yarra Valley", wineStyle: "white" }),
  single("Australia", "Victoria", "Pinot Noir", { appellation: "Mornington Peninsula", wineStyle: "red" }),
  single("Australia", "Victoria", "Chardonnay", { appellation: "Mornington Peninsula", wineStyle: "white" }),
  single("Australia", "Victoria", "Syrah", { appellation: "Heathcote" }),
  single("Australia", "Victoria", "Muscat", { appellation: "Rutherglen" }),
  single("Australia", "Victoria", "Chardonnay", { appellation: "Beechworth", wineStyle: "white" }),
  single("Australia", "Victoria", "Nebbiolo", { appellation: "Beechworth", wineStyle: "red" }),
  single("Australia", "Victoria", "Pinot Noir", { appellation: "Macedon Ranges", wineStyle: "red" }),
  single("Australia", "Victoria", "Chardonnay", { appellation: "Macedon Ranges", wineStyle: "white" }),

  // --- Australia / Western Australia ------------------------------------
  blend("Australia", "Western Australia", ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], {
    appellation: "Margaret River",
    wineStyle: "red",
  }),
  blend("Australia", "Western Australia", ["Sauvignon Blanc", "Sémillon"], {
    appellation: "Margaret River",
    wineStyle: "white",
  }),
  single("Australia", "Western Australia", "Syrah", { appellation: "Great Southern", wineStyle: "red" }),
  single("Australia", "Western Australia", "Riesling", { appellation: "Great Southern", wineStyle: "white" }),
  blend("Australia", "Western Australia", ["Syrah", "Grenache"], { appellation: "Swan Valley", wineStyle: "red" }),
  blend("Australia", "Western Australia", ["Chenin Blanc", "Verdelho"], {
    appellation: "Swan Valley",
    wineStyle: "white",
  }),

  // --- Australia / New South Wales --------------------------------------
  single("Australia", "New South Wales", "Sémillon", { appellation: "Hunter Valley", wineStyle: "white" }),
  single("Australia", "New South Wales", "Syrah", { appellation: "Hunter Valley", wineStyle: "red" }),
  single("Australia", "New South Wales", "Chardonnay", { appellation: "Orange", wineStyle: "white" }),
  single("Australia", "New South Wales", "Syrah", { appellation: "Orange", wineStyle: "red" }),
  single("Australia", "New South Wales", "Riesling", { appellation: "Canberra District", wineStyle: "white" }),
  single("Australia", "New South Wales", "Syrah", { appellation: "Canberra District", wineStyle: "red" }),

  // --- New Zealand / Marlborough -----------------------------------------
  ...["Marlborough", "Wairau Valley", "Awatere Valley", "Southern Valleys"].map((appellation) =>
    single("New Zealand", "Marlborough", "Sauvignon Blanc", { appellation })
  ),

  // --- New Zealand / Central Otago -----------------------------------------
  ...["Central Otago", "Bannockburn", "Gibbston", "Bendigo", "Alexandra", "Cromwell Basin"].map((appellation) =>
    single("New Zealand", "Central Otago", "Pinot Noir", { appellation })
  ),

  // --- New Zealand / Hawke's Bay -----------------------------------------
  blend("New Zealand", "Hawke's Bay", ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], {
    appellation: "Hawke's Bay",
    wineStyle: "red",
  }),
  single("New Zealand", "Hawke's Bay", "Chardonnay", { appellation: "Hawke's Bay", wineStyle: "white" }),
  blend("New Zealand", "Hawke's Bay", ["Cabernet Sauvignon", "Merlot", "Syrah"], {
    appellation: "Gimblett Gravels",
  }),
  blend("New Zealand", "Hawke's Bay", ["Merlot", "Cabernet Franc", "Syrah"], { appellation: "Bridge Pa Triangle" }),
];

// ---------------------------------------------------------------------------
// Lookup engine — four maps, one per precedence tier (see
// GrapeAssistanceKey/getGrapeAssistance below). Built once at module load.
// ---------------------------------------------------------------------------
function lookupKey(parts: Array<string | undefined>): string {
  return parts.map((p) => normalizeText(p ?? "")).join("|");
}

const TIER_1_APPELLATION_STYLE = new Map<string, MappingEntry>();
const TIER_2_APPELLATION = new Map<string, MappingEntry>();
const TIER_3_REGION_STYLE = new Map<string, MappingEntry>();
const TIER_4_REGION = new Map<string, MappingEntry>();

for (const entry of MAPPING_ENTRIES) {
  const hasAppellation = Boolean(entry.appellation);
  const hasStyle = Boolean(entry.wineStyle);
  let target: Map<string, MappingEntry>;
  let key: string;

  if (hasAppellation && hasStyle) {
    target = TIER_1_APPELLATION_STYLE;
    key = lookupKey([entry.country, entry.region, entry.appellation, entry.wineStyle]);
  } else if (hasAppellation) {
    target = TIER_2_APPELLATION;
    key = lookupKey([entry.country, entry.region, entry.appellation]);
  } else if (hasStyle) {
    target = TIER_3_REGION_STYLE;
    key = lookupKey([entry.country, entry.region, entry.wineStyle]);
  } else {
    target = TIER_4_REGION;
    key = lookupKey([entry.country, entry.region]);
  }

  if (process.env.NODE_ENV !== "production" && target.has(key)) {
    throw new Error(
      `grapeAssistance: duplicate mapping entry for ${entry.country} / ${entry.region} / ${entry.appellation ?? "-"} / ${entry.wineStyle ?? "-"}`
    );
  }
  target.set(key, entry);
}

if (process.env.NODE_ENV !== "production") {
  for (const entry of MAPPING_ENTRIES) {
    if (entry.kind === "single" && entry.grapes.length !== 1) {
      throw new Error(`grapeAssistance: a "single" entry must have exactly one grape (${entry.grapes.join(", ")})`);
    }
    if (entry.kind === "blend" && entry.grapes.length < 2) {
      throw new Error(`grapeAssistance: a "blend" entry must have at least two grapes (${entry.grapes.join(", ")})`);
    }
    for (const grape of entry.grapes) {
      if (!isKnownGrapeVariety(grape)) {
        throw new Error(`grapeAssistance: mapped grape "${grape}" is not a known standard grape variety`);
      }
    }
  }
}

/**
 * Looks up curated grape assistance for a Country + Region (+ optional
 * Appellation, + optional Wine style), most-specific match first:
 * 1. Country + Region + Appellation + Wine style
 * 2. Country + Region + Appellation
 * 3. Country + Region + Wine style
 * 4. Country + Region
 * Returns null when nothing curated applies — the normal, expected result
 * for the vast majority of real-world combinations (see README). An empty
 * or missing appellation/wineStyle never matches an appellation-/style-
 * specific tier — it only ever falls through to a broader one.
 */
export function getGrapeAssistance(key: GrapeAssistanceKey): GrapeAssistanceMatch | null {
  const country = key.country.trim();
  const region = key.region.trim();
  const appellation = key.appellation?.trim();
  const wineStyle = key.wineStyle?.trim();
  if (!country || !region) return null;

  let entry: MappingEntry | undefined;
  if (appellation && wineStyle) {
    entry = TIER_1_APPELLATION_STYLE.get(lookupKey([country, region, appellation, wineStyle]));
  }
  if (!entry && appellation) {
    entry = TIER_2_APPELLATION.get(lookupKey([country, region, appellation]));
  }
  if (!entry && wineStyle) {
    entry = TIER_3_REGION_STYLE.get(lookupKey([country, region, wineStyle]));
  }
  if (!entry) {
    entry = TIER_4_REGION.get(lookupKey([country, region]));
  }
  if (!entry) return null;
  return { kind: entry.kind, grapes: entry.grapes };
}

// ---------------------------------------------------------------------------
// Auto-apply state machine (see README "Grape-entry assistance" —
// "Manual-edit tracking"). Pure and framework-free so it's directly
// unit-testable — lib/useGrapeAssistance.ts is only a thin React wrapper
// around `evaluateGrapeAssistanceChange` below.
// ---------------------------------------------------------------------------

export type GrapeValueSource = "empty" | "auto" | "manual";

/** The grape-relevant slice of a bottle/guess form's state, shared with GrapeBlendFormValue. */
export interface GrapeAssistanceGrapeFields {
  grapeBlendMode: GrapeBlendMode | "";
  grapeBlend: string;
  selectedGrapes: string[];
  otherGrapesText: string;
  otherGrapeSelected?: boolean;
}

export interface GrapeAssistanceTriggerFields {
  wineStyle: string;
  country: string;
  region: string;
  appellation: string;
}

export interface GrapeAssistanceOutcome {
  fields: GrapeAssistanceGrapeFields;
  source: GrapeValueSource;
  message: string;
}

export const GRAPE_ASSISTANCE_APPLIED_MESSAGE = "Set from region and appellation. You can edit it.";
export const GRAPE_STYLE_CLEARED_MESSAGE = "Grape selection cleared because the wine style changed.";
export const GRAPE_DETAILS_CLEARED_MESSAGE = "Grape selection cleared because the wine details changed.";

/**
 * True when no grape/blend value has been entered at all — see
 * GrapeValueSource "empty". In single mode this covers both "no dropdown
 * pick yet" and "Other grape selected but no custom text typed yet," since
 * `grapeBlend` holds the custom text directly once `otherGrapeSelected` is
 * true (see GrapeBlendField) — a blank `grapeBlend` means empty either way.
 */
export function isGrapeValueEmpty(fields: GrapeAssistanceGrapeFields): boolean {
  if (fields.grapeBlendMode === "blend") {
    return fields.selectedGrapes.length === 0 && fields.otherGrapesText.trim() === "";
  }
  return fields.grapeBlend.trim() === "";
}

const EMPTY_GRAPE_FIELDS: GrapeAssistanceGrapeFields = {
  grapeBlendMode: "single",
  grapeBlend: "",
  selectedGrapes: [],
  otherGrapesText: "",
  otherGrapeSelected: false,
};

function matchToFields(match: GrapeAssistanceMatch): GrapeAssistanceGrapeFields {
  if (match.kind === "single") {
    return { ...EMPTY_GRAPE_FIELDS, grapeBlendMode: "single", grapeBlend: match.grapes[0] };
  }
  return {
    ...EMPTY_GRAPE_FIELDS,
    grapeBlendMode: "blend",
    grapeBlend: match.grapes.join(" / "),
    selectedGrapes: match.grapes,
  };
}

/**
 * Decides what (if anything) should happen to a bottle/guess form's grape
 * value after one of the trigger fields (wine style, country, region,
 * appellation) changes. Returns `null` when nothing should be auto-mutated
 * — the overwhelmingly common case (no trigger field actually changed, the
 * value is `manual`, or the current mapping/colour is still fine).
 *
 * Ordering matters: the Part 1 colour-incompatibility check (only reacts to
 * a wine-style change, and only for a curated single-variety selection)
 * takes precedence over everything else, including a `manual` source — an
 * existing White grape left selected after switching to Red would otherwise
 * never get caught by the country/region/appellation mapping lookup below,
 * since that lookup doesn't consider colour at all. When it fires, this
 * function deliberately does *not* also apply a fresh mapping in the same
 * call — the field is left empty for the next trigger-field change (or a
 * manual pick) to fill in, rather than silently replacing what was just
 * cleared.
 */
export function evaluateGrapeAssistanceChange(
  prev: GrapeAssistanceTriggerFields,
  current: GrapeAssistanceTriggerFields & GrapeAssistanceGrapeFields,
  source: GrapeValueSource
): GrapeAssistanceOutcome | null {
  const triggerChanged =
    prev.wineStyle !== current.wineStyle ||
    prev.country !== current.country ||
    prev.region !== current.region ||
    prev.appellation !== current.appellation;
  if (!triggerChanged) return null;

  const isSingleMode = current.grapeBlendMode === "single" || current.grapeBlendMode === "";
  if (
    prev.wineStyle !== current.wineStyle &&
    isSingleMode &&
    !current.otherGrapeSelected &&
    current.grapeBlend.trim() !== "" &&
    !isGrapeColorCompatibleWithStyle(current.grapeBlend, current.wineStyle)
  ) {
    return { fields: { ...EMPTY_GRAPE_FIELDS }, source: "empty", message: GRAPE_STYLE_CLEARED_MESSAGE };
  }

  if (source === "manual") return null;

  const match = getGrapeAssistance({
    country: current.country,
    region: current.region,
    appellation: current.appellation.trim() || undefined,
    wineStyle: current.wineStyle.trim() || undefined,
  });

  if (!match) {
    if (source === "auto") {
      return { fields: { ...EMPTY_GRAPE_FIELDS }, source: "empty", message: GRAPE_DETAILS_CLEARED_MESSAGE };
    }
    return null;
  }

  return { fields: matchToFields(match), source: "auto", message: GRAPE_ASSISTANCE_APPLIED_MESSAGE };
}
