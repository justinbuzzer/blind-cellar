"use client";

import { useId, useState } from "react";
import { GRAPE_VARIETIES, grapeVarietiesPopularFirst } from "@/lib/wineReferenceData";

interface GrapeMultiSelectProps {
  label: string;
  helperText?: string;
  selected: string[];
  onChange: (next: string[]) => void;
  error?: string;
  /** See GrapeBlendFieldProps — sorts the most commonly encountered grapes to the top of the list. */
  popularFirst?: boolean;
}

/**
 * Accessible multi-select for picking blend component grapes from the same
 * curated list single-variety mode uses. Not a floating popover/combobox —
 * this app has no existing popover primitive suited to an inline dropdown
 * (Modal.tsx is a full-screen dialog), so this uses the simpler, equally
 * accessible fallback of an always-visible, searchable checkbox list plus
 * removable chips for the current selection, matching every other form
 * field's native-control-first approach.
 */
export function GrapeMultiSelect({
  label,
  helperText,
  selected,
  onChange,
  error,
  popularFirst,
}: GrapeMultiSelectProps) {
  const [filter, setFilter] = useState("");
  const groupId = useId();
  const helperId = `${groupId}-helper`;
  const errorId = `${groupId}-error`;
  const describedBy = [helperText ? helperId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  const orderedGrapes = popularFirst ? grapeVarietiesPopularFirst(GRAPE_VARIETIES) : GRAPE_VARIETIES;
  const filtered = orderedGrapes.filter((grape) =>
    grape.label.toLowerCase().includes(filter.trim().toLowerCase())
  );
  const sortedSelected = [...selected].sort((a, b) => a.localeCompare(b));

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  }

  function remove(value: string) {
    onChange(selected.filter((v) => v !== value));
  }

  return (
    <div className="flex flex-col gap-2">
      <fieldset aria-describedby={describedBy || undefined}>
        <legend className="text-sm font-medium text-cellar-text">{label}</legend>

        {sortedSelected.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Selected grapes">
            {sortedSelected.map((grape) => (
              <li key={grape}>
                <button
                  type="button"
                  onClick={() => remove(grape)}
                  aria-label={`Remove ${grape} from blend`}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-cellar-maroon bg-cellar-maroon/5 px-3 py-1 text-sm font-medium text-cellar-maroon transition-colors hover:bg-cellar-maroon/10 focus:outline-none focus:ring-2 focus:ring-cellar-gold"
                >
                  {grape}
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search grape varieties…"
          aria-label="Search grape varieties"
          className="mt-2 w-full rounded-sm border border-cellar-border bg-white px-3 py-2 text-base text-cellar-text placeholder:text-cellar-text/40 focus:outline-none focus:ring-2 focus:ring-cellar-gold"
        />

        <div
          className={`mt-2 max-h-56 overflow-y-auto rounded-sm border bg-white p-1 ${
            error ? "border-cellar-danger" : "border-cellar-border"
          }`}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-cellar-text/50">
              No grapes match your search.
            </p>
          ) : (
            filtered.map((grape) => {
              const checked = selected.includes(grape.value);
              return (
                <label
                  key={grape.value}
                  className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-sm text-cellar-text hover:bg-cellar-bg"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(grape.value)}
                    className="h-5 w-5 shrink-0 rounded border-cellar-border text-cellar-maroon focus:outline-none focus:ring-2 focus:ring-cellar-gold"
                  />
                  <span>{grape.label}</span>
                </label>
              );
            })
          )}
        </div>
      </fieldset>

      {helperText && (
        <p id={helperId} className="text-xs text-cellar-text/60">
          {helperText}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-cellar-danger">
          {error}
        </p>
      )}
    </div>
  );
}
