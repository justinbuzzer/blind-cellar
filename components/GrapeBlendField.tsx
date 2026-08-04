import { GrapeBlendMode } from "@/types/tasting";
import { combineBlendComponents, GRAPE_VARIETY_OPTIONS } from "@/lib/wineReferenceData";
import { SegmentedControl } from "./SegmentedControl";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";
import { GrapeMultiSelect } from "./GrapeMultiSelect";

/** The grape/blend slice of a bottle-form or guess-entry form's state. */
export interface GrapeBlendFormValue {
  grapeBlendMode: GrapeBlendMode | "";
  grapeBlend: string;
  selectedGrapes: string[];
  otherGrapesText: string;
}

interface GrapeBlendFieldProps {
  value: GrapeBlendFormValue;
  onChange: (value: GrapeBlendFormValue) => void;
  error?: string;
}

/**
 * Single variety / Blend mode selector. Single variety is unchanged: a
 * curated dropdown storing one canonical grape name in `grapeBlend`. Blend
 * mode uses a multi-select of the same curated list plus an optional
 * free-text field for varieties not on it — `grapeBlend` is *derived* from
 * those two (via `combineBlendComponents`) into a canonical, alphabetised,
 * "/"-joined display/storage string any time either changes, so the
 * existing blend scoring (which re-tokenises that same string) needs no
 * changes to understand blends built with this picker.
 */
export function GrapeBlendField({ value, onChange, error }: GrapeBlendFieldProps) {
  const mode = value.grapeBlendMode || "single";

  function selectMode(next: GrapeBlendMode) {
    onChange({
      grapeBlendMode: next,
      grapeBlend: "",
      selectedGrapes: [],
      otherGrapesText: "",
    });
  }

  function setSingleGrape(next: string) {
    onChange({ ...value, grapeBlend: next });
  }

  function setSelectedGrapes(next: string[]) {
    onChange({
      ...value,
      selectedGrapes: next,
      grapeBlend: combineBlendComponents(next, value.otherGrapesText).join(" / "),
    });
  }

  function setOtherGrapesText(next: string) {
    onChange({
      ...value,
      otherGrapesText: next,
      grapeBlend: combineBlendComponents(value.selectedGrapes, next).join(" / "),
    });
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
          value={value.grapeBlend}
          onChange={(e) => setSingleGrape(e.target.value)}
          placeholder="Select grape variety"
          options={GRAPE_VARIETY_OPTIONS}
          error={error}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <GrapeMultiSelect
            label="Grapes in this blend"
            helperText="Select all grape varieties that apply. You may add an unlisted variety below if needed."
            selected={value.selectedGrapes}
            onChange={setSelectedGrapes}
            error={error}
          />
          <TextField
            label="Other grape(s), if not listed"
            hint="Add only varieties not available above. Separate multiple grapes with commas or slashes."
            placeholder="e.g. Carignan, Counoise"
            value={value.otherGrapesText}
            onChange={(e) => setOtherGrapesText(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
