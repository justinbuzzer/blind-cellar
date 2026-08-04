import { GrapeBlendMode, WineGuess } from "@/types/tasting";
import {
  COUNTRY_OPTIONS,
  regionOptionsForCountry,
  resetRegionIfInvalid,
} from "@/lib/wineReferenceData";
import { Card } from "./Card";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
import { TextAreaField } from "./TextAreaField";
import { RatingSlider } from "./RatingSlider";
import { ConfidencePicker } from "./ConfidencePicker";
import { VintageField } from "./VintageField";
import { GrapeBlendField } from "./GrapeBlendField";

interface WineGuessFormProps {
  wineCode: string;
  value: WineGuess;
  onChange: (value: WineGuess) => void;
  ratingError?: string;
}

export function WineGuessForm({
  wineCode,
  value,
  onChange,
  ratingError,
}: WineGuessFormProps) {
  function set<K extends keyof WineGuess>(key: K, fieldValue: WineGuess[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  function setCountry(nextCountry: string) {
    onChange({
      ...value,
      country: nextCountry,
      region: resetRegionIfInvalid(nextCountry, value.region),
    });
  }

  function setGrapeBlendMode(mode: GrapeBlendMode) {
    onChange({ ...value, grapeBlendMode: mode, grapeBlend: "" });
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-cellar-maroon-dark">
        {wineCode}
      </h2>

      <RatingSlider
        value={value.rating}
        onChange={(rating) => set("rating", rating)}
        error={ratingError}
      />

      <ConfidencePicker
        value={value.confidence}
        onChange={(confidence) => set("confidence", confidence)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Country guess"
          value={value.country}
          placeholder="Select country"
          options={COUNTRY_OPTIONS}
          onChange={(e) => setCountry(e.target.value)}
        />
        <SelectField
          label="Region guess"
          value={value.region}
          placeholder={value.country ? "Select region" : "Select country first"}
          disabled={!value.country}
          options={regionOptionsForCountry(value.country)}
          onChange={(e) => set("region", e.target.value)}
        />
        <TextField
          label="Producer — bonus"
          value={value.producer}
          onChange={(e) => set("producer", e.target.value)}
        />
        <TextField
          label="Wine / cuvée — bonus"
          value={value.wineName}
          onChange={(e) => set("wineName", e.target.value)}
        />
      </div>

      <GrapeBlendField
        mode={value.grapeBlendMode || "single"}
        value={value.grapeBlend}
        onModeChange={setGrapeBlendMode}
        onValueChange={(next) => set("grapeBlend", next)}
      />

      <VintageField
        value={value.vintage}
        onChange={(next) => set("vintage", next)}
      />

      <TextAreaField
        label="Tasting note (optional)"
        value={value.note ?? ""}
        onChange={(e) => set("note", e.target.value)}
        placeholder="Nose, palate, anything that stood out"
      />
    </Card>
  );
}
