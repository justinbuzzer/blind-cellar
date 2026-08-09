import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import {
  ALL_FILTER_VALUE,
  CellarFilterValues,
  computeCellarFilterOptions,
  hasActiveCellarFilters,
  updateCellarFilter,
} from "@/lib/cellarFilters";
import { CellarBottleGroup } from "@/lib/cellarGrouping";

interface CellarFilterBarProps {
  groups: CellarBottleGroup[];
  values: CellarFilterValues;
  onChange: (next: CellarFilterValues) => void;
}

/**
 * Shared cascading cellar filter strip (see README "Personal Cellar" —
 * "Grouped display"), reused unchanged by My Cellar and the Add-from-cellar
 * picker — the only thing that ever differs between the two is which
 * already-scoped `groups` array is passed in (a single status tab for My
 * Cellar, Available-only for the picker). Applies immediately on selection
 * — no separate "Apply filters" step — and every dependent reset is resolved
 * by `updateCellarFilter` before this component re-renders with new values.
 */
export function CellarFilterBar({ groups, values, onChange }: CellarFilterBarProps) {
  const options = computeCellarFilterOptions(groups, values);

  function set(field: keyof CellarFilterValues, next: string) {
    onChange(updateCellarFilter(groups, values, field, next));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SelectField
          label="Type"
          value={values.type}
          onChange={(e) => set("type", e.target.value)}
          options={[{ value: ALL_FILTER_VALUE, label: "All types" }, ...options.types]}
        />
        <SelectField
          label="Country"
          value={values.country}
          onChange={(e) => set("country", e.target.value)}
          options={[{ value: ALL_FILTER_VALUE, label: "All countries" }, ...options.countries]}
        />
        <SelectField
          label="Region"
          value={values.region}
          onChange={(e) => set("region", e.target.value)}
          options={[{ value: ALL_FILTER_VALUE, label: "All regions" }, ...options.regions]}
        />
        <SelectField
          label="Appellation"
          value={values.appellation}
          onChange={(e) => set("appellation", e.target.value)}
          options={[{ value: ALL_FILTER_VALUE, label: "All appellations" }, ...options.appellations]}
        />
      </div>
      {hasActiveCellarFilters(values) && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange({ type: ALL_FILTER_VALUE, country: ALL_FILTER_VALUE, region: ALL_FILTER_VALUE, appellation: ALL_FILTER_VALUE })}
          className="self-start"
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
