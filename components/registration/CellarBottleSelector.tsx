"use client";

import { useMemo, useState } from "react";
import { TextField } from "@/components/TextField";
import { SelectField } from "@/components/SelectField";
import { cellarBottleFormatLabel, cellarWineIdentityLabel } from "@/lib/cellar";
import { normalizeText } from "@/lib/normalize";
import { CellarBottleRow } from "@/lib/supabase/types";
import { BOTTLE_FORMAT_LABELS, WINE_STYLE_LABELS } from "@/types/tasting";

interface CellarBottleSelectorProps {
  bottles: CellarBottleRow[];
  onSelect: (bottle: CellarBottleRow) => void;
}

/**
 * The searchable list of the signed-in user's own `available` cellar
 * bottles, shown when they choose "Add from my cellar" during tasting
 * registration (see README "Personal Cellar"). `bottles` is already
 * RLS-scoped to the current owner and filtered to `available` by the
 * caller — this component only ever narrows that same set further, never
 * fetches anything itself. Filtering happens client-side over this one
 * already-authorized, already-bounded list, not a fresh query per keystroke.
 */
export function CellarBottleSelector({ bottles, onSelect }: CellarBottleSelectorProps) {
  const [search, setSearch] = useState("");
  const [styleFilter, setStyleFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");

  const countries = useMemo(
    () => Array.from(new Set(bottles.map((b) => b.country))).sort((a, b) => a.localeCompare(b)),
    [bottles]
  );
  const styles = useMemo(() => Array.from(new Set(bottles.map((b) => b.wine_style))), [bottles]);
  const formats = useMemo(() => Array.from(new Set(bottles.map((b) => b.bottle_format))), [bottles]);

  const filtered = useMemo(() => {
    const query = normalizeText(search);
    return bottles.filter((bottle) => {
      if (styleFilter !== "all" && bottle.wine_style !== styleFilter) return false;
      if (countryFilter !== "all" && bottle.country !== countryFilter) return false;
      if (formatFilter !== "all" && bottle.bottle_format !== formatFilter) return false;
      if (!query) return true;
      const haystack = [
        bottle.producer,
        bottle.wine_cuvee,
        bottle.vintage,
        bottle.country,
        bottle.region,
        bottle.grape_blend,
        bottle.storage_location ?? "",
      ]
        .map(normalizeText)
        .join(" ");
      return haystack.includes(query);
    });
  }, [bottles, search, styleFilter, countryFilter, formatFilter]);

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Search your wines"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Producer, wine, region, country, grape…"
      />

      <div className="grid grid-cols-3 gap-2">
        <SelectField
          label="Style"
          value={styleFilter}
          onChange={(e) => setStyleFilter(e.target.value)}
          options={[
            { value: "all", label: "All styles" },
            ...styles.map((s) => ({ value: s, label: WINE_STYLE_LABELS[s] })),
          ]}
        />
        <SelectField
          label="Country"
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          options={[{ value: "all", label: "All countries" }, ...countries.map((c) => ({ value: c, label: c }))]}
        />
        <SelectField
          label="Format"
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value)}
          options={[
            { value: "all", label: "All formats" },
            ...formats.map((f) => ({ value: f, label: BOTTLE_FORMAT_LABELS[f] })),
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-cellar-muted">No matching bottles in your cellar.</p>
      ) : (
        <ul className="divide-y divide-cellar-border">
          {filtered.map((bottle) => (
            <li key={bottle.id}>
              <button
                type="button"
                onClick={() => onSelect(bottle)}
                className="flex min-h-[44px] w-full flex-col gap-1 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
              >
                <span className="font-display text-base font-semibold text-cellar-maroon-dark">
                  {cellarWineIdentityLabel(bottle)}
                </span>
                <span className="text-sm text-cellar-muted">
                  {bottle.region}, {bottle.country} · {WINE_STYLE_LABELS[bottle.wine_style]} ·{" "}
                  {cellarBottleFormatLabel(bottle)}
                  {bottle.storage_location && <> · {bottle.storage_location}</>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
