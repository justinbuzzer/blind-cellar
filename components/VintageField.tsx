import { useMemo } from "react";
import { SegmentedControl } from "./SegmentedControl";
import { SelectField } from "./SelectField";

interface VintageFieldProps {
  /** "" (unset), "NV", or a four-digit year string. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

const MIN_YEAR = 1900;
const MAX_YEAR = new Date().getFullYear() + 1;

function buildYearOptions(): { value: string; label: string }[] {
  const years: { value: string; label: string }[] = [];
  for (let year = MAX_YEAR; year >= MIN_YEAR; year -= 1) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
}

type VintageMode = "year" | "nv";

/**
 * A segmented Vintage year / NV toggle plus a descending year dropdown,
 * replacing a raw free-text vintage input. Switching segments clears the
 * previous value, matching the spec's explicit toggle behaviour.
 */
export function VintageField({ value, onChange, error }: VintageFieldProps) {
  const yearOptions = useMemo(buildYearOptions, []);
  const mode: VintageMode = value.trim().toUpperCase() === "NV" ? "nv" : "year";
  const yearValue = mode === "year" ? value : "";

  function selectMode(next: VintageMode) {
    onChange(next === "nv" ? "NV" : "");
  }

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl<VintageMode>
        label="Vintage"
        value={mode}
        options={[
          { value: "year", label: "Vintage year" },
          { value: "nv", label: "NV" },
        ]}
        onChange={selectMode}
      />
      {mode === "year" ? (
        <SelectField
          label="Year"
          value={yearValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Select year"
          options={yearOptions}
          error={error}
        />
      ) : (
        error && <p className="text-xs font-medium text-cellar-danger">{error}</p>
      )}
    </div>
  );
}
