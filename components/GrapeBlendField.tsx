import { GrapeBlendMode } from "@/types/tasting";
import { GRAPE_VARIETY_OPTIONS } from "@/lib/wineReferenceData";
import { SegmentedControl } from "./SegmentedControl";
import { SelectField } from "./SelectField";
import { TextAreaField } from "./TextAreaField";

interface GrapeBlendFieldProps {
  mode: GrapeBlendMode;
  value: string;
  onModeChange: (mode: GrapeBlendMode) => void;
  onValueChange: (value: string) => void;
  error?: string;
}

/**
 * Single variety / Blend mode selector: a curated dropdown for a single
 * grape, or an open-text description for a blend. Switching modes clears
 * the previous value, since a canonical single-grape value and free-text
 * blend wording aren't interchangeable.
 */
export function GrapeBlendField({
  mode,
  value,
  onModeChange,
  onValueChange,
  error,
}: GrapeBlendFieldProps) {
  function selectMode(next: GrapeBlendMode) {
    onModeChange(next);
    onValueChange("");
  }

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl<GrapeBlendMode>
        label="Grape / blend"
        value={mode}
        options={[
          { value: "single", label: "Single variety" },
          { value: "blend", label: "Blend" },
        ]}
        onChange={selectMode}
      />
      {mode === "single" ? (
        <SelectField
          label="Grape variety"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Select grape variety"
          options={GRAPE_VARIETY_OPTIONS}
          error={error}
        />
      ) : (
        <TextAreaField
          label="Describe the blend"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Cabernet Sauvignon / Merlot / Cabernet Franc"
          error={error}
        />
      )}
    </div>
  );
}
