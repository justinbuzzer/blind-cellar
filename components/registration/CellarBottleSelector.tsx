"use client";

import { useMemo, useState } from "react";
import { TextField } from "@/components/TextField";
import { CellarFilterBar } from "@/components/cellar/CellarFilterBar";
import { cellarWineIdentityLabel } from "@/lib/cellar";
import { applyCellarFilters, CellarFilterValues, DEFAULT_CELLAR_FILTERS } from "@/lib/cellarFilters";
import {
  CellarBottleGroup,
  formatAvailableCountLabel,
  formatCellarFormatLine,
  formatCellarOriginLine,
  groupCellarBottles,
} from "@/lib/cellarGrouping";
import { normalizeText } from "@/lib/normalize";
import { CellarBottleRow } from "@/lib/supabase/types";

interface CellarBottleSelectorProps {
  bottles: CellarBottleRow[];
  onSelect: (group: CellarBottleGroup) => void;
}

/**
 * The searchable, groupable list of the signed-in user's own `available`
 * cellar bottles, shown when they choose "Add from my cellar" during
 * tasting registration (see README "Personal Cellar" — "Grouped display").
 * `bottles` is already RLS-scoped to the current owner and filtered to
 * `available` by the caller — this component only ever groups/narrows that
 * same set further, never fetches anything itself. Matching physical
 * bottles are shown as one grouped row with an available count, using the
 * exact same grouping/filter helpers as My Cellar so the two views can
 * never silently diverge.
 */
export function CellarBottleSelector({ bottles, onSelect }: CellarBottleSelectorProps) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CellarFilterValues>(DEFAULT_CELLAR_FILTERS);

  const groups = useMemo(() => groupCellarBottles(bottles), [bottles]);
  const filteredByDropdowns = useMemo(() => applyCellarFilters(groups, filters), [groups, filters]);

  const filtered = useMemo(() => {
    const query = normalizeText(search);
    if (!query) return filteredByDropdowns;
    return filteredByDropdowns.filter((group) => {
      const r = group.representative;
      const haystack = [
        r.producer,
        r.wine_cuvee,
        r.vintage,
        r.country,
        r.region,
        r.appellation ?? "",
        r.grape_blend,
        r.storage_location ?? "",
      ]
        .map(normalizeText)
        .join(" ");
      return haystack.includes(query);
    });
  }, [filteredByDropdowns, search]);

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Search your wines"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Producer, wine, region, country, grape…"
      />

      <CellarFilterBar groups={groups} values={filters} onChange={setFilters} />

      {filtered.length === 0 ? (
        <p className="text-sm text-cellar-muted">No matching bottles in your cellar.</p>
      ) : (
        <ul className="divide-y divide-cellar-border">
          {filtered.map((group) => (
            <li key={group.groupKey}>
              <button
                type="button"
                onClick={() => onSelect(group)}
                className="flex min-h-[44px] w-full flex-col gap-1 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
              >
                <span className="font-display text-base font-semibold text-cellar-maroon-dark">
                  {cellarWineIdentityLabel(group.representative)}
                </span>
                <span className="text-sm text-cellar-muted">{formatCellarOriginLine(group.representative)}</span>
                <span className="text-sm text-cellar-muted">{formatCellarFormatLine(group.representative)}</span>
                <span className="text-sm font-medium text-cellar-text">
                  {formatAvailableCountLabel(group.bottleCount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
