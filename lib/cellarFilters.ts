import { CellarBottleGroup } from "@/lib/cellarGrouping";
import { WINE_STYLE_LABELS, WINE_STYLES, WineStyle } from "@/types/tasting";

// ---------------------------------------------------------------------------
// Shared cascading cellar filters (see README "Personal Cellar" — "Grouped
// display"), used identically by My Cellar and the Add-from-cellar picker.
// Pure functions only, operating on an already-owner/status-scoped array of
// `CellarBottleGroup`s — never a fresh query, never anything cross-owner.
// Cascade order: Type -> Country -> Region -> Appellation.
// ---------------------------------------------------------------------------

export const ALL_FILTER_VALUE = "all";

export interface CellarFilterValues {
  type: string;
  country: string;
  region: string;
  appellation: string;
}

export const DEFAULT_CELLAR_FILTERS: CellarFilterValues = {
  type: ALL_FILTER_VALUE,
  country: ALL_FILTER_VALUE,
  region: ALL_FILTER_VALUE,
  appellation: ALL_FILTER_VALUE,
};

export interface CellarFilterOption {
  value: string;
  label: string;
}

export interface CellarFilterOptionSets {
  types: CellarFilterOption[];
  countries: CellarFilterOption[];
  regions: CellarFilterOption[];
  appellations: CellarFilterOption[];
}

function matchesType(group: CellarBottleGroup, type: string): boolean {
  return type === ALL_FILTER_VALUE || group.representative.wine_style === type;
}

function matchesCountry(group: CellarBottleGroup, country: string): boolean {
  return country === ALL_FILTER_VALUE || group.representative.country === country;
}

function matchesRegion(group: CellarBottleGroup, region: string): boolean {
  return region === ALL_FILTER_VALUE || group.representative.region === region;
}

function matchesAppellation(group: CellarBottleGroup, appellation: string): boolean {
  return appellation === ALL_FILTER_VALUE || (group.representative.appellation ?? "") === appellation;
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function buildTypeOptions(groups: CellarBottleGroup[]): CellarFilterOption[] {
  const present = new Set(groups.map((g) => g.representative.wine_style));
  return WINE_STYLES.filter((style): style is WineStyle => present.has(style)).map((style) => ({
    value: style,
    label: WINE_STYLE_LABELS[style],
  }));
}

function buildCountryOptions(groups: CellarBottleGroup[]): CellarFilterOption[] {
  return sortedUnique(groups.map((g) => g.representative.country)).map((country) => ({
    value: country,
    label: country,
  }));
}

/**
 * Region value stays the plain region string (filtering only ever compares
 * exact field equality); only the *label* gains a country suffix, and only
 * when the same region name is genuinely shared by more than one country
 * among the currently eligible groups (see README "Personal Cellar" —
 * "Grouped display" — region ambiguity is extremely rare in this app's
 * curated per-country region lists, but handled correctly regardless).
 */
function buildRegionOptions(groups: CellarBottleGroup[]): CellarFilterOption[] {
  const countriesByRegion = new Map<string, Set<string>>();
  for (const g of groups) {
    const region = g.representative.region;
    if (!region) continue; // never a selectable blank region
    if (!countriesByRegion.has(region)) countriesByRegion.set(region, new Set());
    countriesByRegion.get(region)!.add(g.representative.country);
  }
  return Array.from(countriesByRegion.entries())
    .map(([region, countries]) => {
      const ambiguous = countries.size > 1;
      const label = ambiguous
        ? `${region} — ${Array.from(countries).sort((a, b) => a.localeCompare(b)).join(" / ")}`
        : region;
      return { value: region, label };
    })
    .sort((a, b) => a.value.localeCompare(b.value));
}

/** Same approach as regions — value is the plain appellation string; the label gains "Region, Country" only when ambiguous. */
function buildAppellationOptions(groups: CellarBottleGroup[]): CellarFilterOption[] {
  const contextsByAppellation = new Map<string, Set<string>>();
  for (const g of groups) {
    const appellation = g.representative.appellation?.trim();
    if (!appellation) continue; // never a selectable blank appellation
    const context = `${g.representative.region}, ${g.representative.country}`;
    if (!contextsByAppellation.has(appellation)) contextsByAppellation.set(appellation, new Set());
    contextsByAppellation.get(appellation)!.add(context);
  }
  return Array.from(contextsByAppellation.entries())
    .map(([appellation, contexts]) => {
      const ambiguous = contexts.size > 1;
      const label = ambiguous
        ? `${appellation} — ${Array.from(contexts).sort((a, b) => a.localeCompare(b)).join(" / ")}`
        : appellation;
      return { value: appellation, label };
    })
    .sort((a, b) => a.value.localeCompare(b.value));
}

/**
 * Computes every dropdown's option list for the given (possibly still-stale)
 * filter values. Each level is scoped only by its parents in the cascade —
 * Type options ignore every other filter; Country options are scoped by
 * Type; Region by Type+Country; Appellation by Type+Country+Region. Callers
 * that need this to reflect the *final* set of options after a user edit
 * should first resolve dependent resets via `updateCellarFilter`.
 */
export function computeCellarFilterOptions(
  groups: CellarBottleGroup[],
  values: CellarFilterValues
): CellarFilterOptionSets {
  const countryScoped = groups.filter((g) => matchesType(g, values.type));
  const regionScoped = countryScoped.filter((g) => matchesCountry(g, values.country));
  const appellationScoped = regionScoped.filter((g) => matchesRegion(g, values.region));

  return {
    types: buildTypeOptions(groups),
    countries: buildCountryOptions(countryScoped),
    regions: buildRegionOptions(regionScoped),
    appellations: buildAppellationOptions(appellationScoped),
  };
}

/** AND semantics across all four dimensions; "all" is a wildcard for that dimension. */
export function applyCellarFilters(groups: CellarBottleGroup[], values: CellarFilterValues): CellarBottleGroup[] {
  return groups.filter(
    (g) =>
      matchesType(g, values.type) &&
      matchesCountry(g, values.country) &&
      matchesRegion(g, values.region) &&
      matchesAppellation(g, values.appellation)
  );
}

function revalidate(
  groups: CellarBottleGroup[],
  values: CellarFilterValues,
  field: "country" | "region" | "appellation"
): string {
  const current = values[field];
  if (current === ALL_FILTER_VALUE) return ALL_FILTER_VALUE;
  const options = computeCellarFilterOptions(groups, values);
  const key = field === "country" ? "countries" : field === "region" ? "regions" : "appellations";
  const stillValid = options[key].some((o) => o.value === current);
  return stillValid ? current : ALL_FILTER_VALUE;
}

/**
 * Applies one user-driven filter change and resolves every dependent reset
 * in cascade order (see README "Personal Cellar" — "Grouped display" —
 * "Cascading filters"): changing Type may invalidate Country/Region/
 * Appellation; changing Country may invalidate Region/Appellation; changing
 * Region may invalidate Appellation. Changing Appellation never touches its
 * parents. A dependent value is kept only if it's still among the valid
 * options computed from the *new* parent values; otherwise it resets to
 * "all" — a selected filter is never left pointing at zero-option stale
 * state.
 */
export function updateCellarFilter(
  groups: CellarBottleGroup[],
  current: CellarFilterValues,
  field: keyof CellarFilterValues,
  nextValue: string
): CellarFilterValues {
  const next: CellarFilterValues = { ...current, [field]: nextValue };

  if (field === "type") {
    next.country = revalidate(groups, next, "country");
    next.region = revalidate(groups, next, "region");
    next.appellation = revalidate(groups, next, "appellation");
  } else if (field === "country") {
    next.region = revalidate(groups, next, "region");
    next.appellation = revalidate(groups, next, "appellation");
  } else if (field === "region") {
    next.appellation = revalidate(groups, next, "appellation");
  }

  return next;
}

export function hasActiveCellarFilters(values: CellarFilterValues): boolean {
  return (
    values.type !== ALL_FILTER_VALUE ||
    values.country !== ALL_FILTER_VALUE ||
    values.region !== ALL_FILTER_VALUE ||
    values.appellation !== ALL_FILTER_VALUE
  );
}
