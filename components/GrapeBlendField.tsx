import { GrapeBlendMode } from "@/types/tasting";
import {
  combineBlendComponents,
  MAX_OTHER_GRAPE_LENGTH,
  singleGrapeVarietyOptionsForStyle,
} from "@/lib/wineReferenceData";
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
  /** Single mode only — see the identically-named field on WineIdentityInput/WineGuess. */
  otherGrapeSelected?: boolean;
}

interface GrapeBlendFieldProps {
  value: GrapeBlendFormValue;
  onChange: (value: GrapeBlendFormValue) => void;
  error?: string;
  /**
   * Filters the single-variety dropdown to that colour's standard grapes
   * (see README "Grape-entry assistance"). White/Red show only their own
   * skin colour; every other style (including "" / not yet chosen) can
   * legitimately be either, so both are shown. Omit entirely for a form
   * with no wine-style concept (see WineGuessForm) — same as passing "".
   */
  wineStyle?: string;
}

/** Dropdown sentinel for "Other grape" — never persisted; see setSingleGrapeSelection. */
const OTHER_GRAPE_VALUE = "__other_grape__";
const OTHER_GRAPE_HINT = "Enter the grape variety.";

function singleGrapeDropdownOptions(wineStyle?: string) {
  return [
    ...singleGrapeVarietyOptionsForStyle(wineStyle).map((g) => ({ value: g.value, label: g.label })),
    { value: OTHER_GRAPE_VALUE, label: "Other grape" },
  ];
}

/**
 * Single variety / Blend mode selector. Single variety is a curated
 * dropdown storing one canonical grape name in `grapeBlend`, plus a final
 * "Other grape" option that reveals a free-text input for a variety not on
 * the list — the typed name is stored directly in `grapeBlend` (never the
 * literal "Other grape" label); `otherGrapeSelected` is UI-only state that
 * decides which control is shown and never affects scoring or storage. Blend
 * mode is unrelated and unchanged: a multi-select of the same curated list
 * plus an optional free-text field for varieties not on it — `grapeBlend` is
 * *derived* from those two (via `combineBlendComponents`) into a canonical,
 * alphabetised, "/"-joined display/storage string any time either changes,
 * so the existing blend scoring (which re-tokenises that same string) needs
 * no changes to understand blends built with this picker.
 */
export function GrapeBlendField({ value, onChange, error, wineStyle }: GrapeBlendFieldProps) {
  const mode = value.grapeBlendMode || "single";
  const singleGrapeOptions = singleGrapeDropdownOptions(wineStyle);

  function selectMode(next: GrapeBlendMode) {
    onChange({
      grapeBlendMode: next,
      grapeBlend: "",
      selectedGrapes: [],
      otherGrapesText: "",
      otherGrapeSelected: false,
    });
  }

  /** Dropdown onChange for single-variety mode: either a curated grape, or the "Other grape" sentinel. */
  function setSingleGrapeSelection(selected: string) {
    if (selected === OTHER_GRAPE_VALUE) {
      onChange({ ...value, grapeBlend: "", otherGrapeSelected: true });
    } else {
      onChange({ ...value, grapeBlend: selected, otherGrapeSelected: false });
    }
  }

  function setOtherGrapeText(next: string) {
    onChange({ ...value, grapeBlend: next, otherGrapeSelected: true });
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
        <div className="flex flex-col gap-2">
          <SelectField
            label="Grape variety"
            value={value.otherGrapeSelected ? OTHER_GRAPE_VALUE : value.grapeBlend}
            onChange={(e) => setSingleGrapeSelection(e.target.value)}
            placeholder="Select grape variety"
            options={singleGrapeOptions}
            error={value.otherGrapeSelected ? undefined : error}
          />
          {value.otherGrapeSelected && (
            <TextField
              label="Grape variety"
              hint={OTHER_GRAPE_HINT}
              value={value.grapeBlend}
              maxLength={MAX_OTHER_GRAPE_LENGTH}
              onChange={(e) => setOtherGrapeText(e.target.value)}
              error={error}
            />
          )}
        </div>
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
