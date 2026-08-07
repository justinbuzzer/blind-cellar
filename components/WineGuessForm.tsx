import { useState } from "react";
import { WineGuess } from "@/types/tasting";
import {
  COUNTRY_OPTIONS,
  regionOptionsForCountry,
  resetRegionIfInvalid,
} from "@/lib/wineReferenceData";
import { getAppellations, hasAppellations } from "@/lib/appellations";
import { Card } from "./Card";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
import { TextAreaField } from "./TextAreaField";
import { RatingSlider } from "./RatingSlider";
import { ConfidencePicker } from "./ConfidencePicker";
import { VintageField } from "./VintageField";
import { GrapeBlendField, GrapeBlendFormValue } from "./GrapeBlendField";
import { SectionEyebrow } from "./SectionEyebrow";

const WINE_CUVEE_HINT = "Enter the wine name or cuvée.";
const APPELLATION_HINT = "Optional. Select an appellation if you have a specific call.";
const APPELLATION_CLEARED_MESSAGE = "Appellation cleared because the region changed.";

interface WineGuessFormProps {
  wineCode: string;
  value: WineGuess;
  onChange: (value: WineGuess) => void;
  ratingError?: string;
  blendError?: string;
}

export function WineGuessForm({
  wineCode,
  value,
  onChange,
  ratingError,
  blendError,
}: WineGuessFormProps) {
  const [clearedMessage, setClearedMessage] = useState("");

  function set<K extends keyof WineGuess>(key: K, fieldValue: WineGuess[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  function announceAppellationClearedIfNeeded(hadAppellation: string) {
    setClearedMessage(hadAppellation.trim() ? APPELLATION_CLEARED_MESSAGE : "");
  }

  function setCountry(nextCountry: string) {
    const nextRegion = resetRegionIfInvalid(nextCountry, value.region);
    onChange({
      ...value,
      country: nextCountry,
      region: nextRegion,
      appellation: "",
    });
    announceAppellationClearedIfNeeded(value.appellation);
  }

  function setRegion(nextRegion: string) {
    onChange({ ...value, region: nextRegion, appellation: "" });
    announceAppellationClearedIfNeeded(value.appellation);
  }

  function setGrapeBlend(next: GrapeBlendFormValue) {
    onChange({ ...value, ...next });
  }

  const appellationOptions = getAppellations(value.country, value.region).map((name) => ({
    value: name,
    label: name,
  }));
  const showAppellation = hasAppellations(value.country, value.region);

  return (
    <Card className="flex flex-col gap-0 p-0">
      <h2 className="border-b border-cellar-border p-5 font-display text-2xl font-semibold text-cellar-maroon-dark">
        {wineCode}
      </h2>

      <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
        <SectionEyebrow>Origin</SectionEyebrow>
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
            onChange={(e) => setRegion(e.target.value)}
          />
        </div>
        {showAppellation && (
          <SelectField
            label="Appellation"
            value={value.appellation}
            hint={APPELLATION_HINT}
            placeholder="Select an appellation"
            options={appellationOptions}
            onChange={(e) => set("appellation", e.target.value)}
          />
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {clearedMessage}
        </p>
      </div>

      <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
        <SectionEyebrow>Identity</SectionEyebrow>
        <GrapeBlendField
          value={{
            grapeBlendMode: value.grapeBlendMode,
            grapeBlend: value.grapeBlend,
            selectedGrapes: value.selectedGrapes,
            otherGrapesText: value.otherGrapesText,
          }}
          onChange={setGrapeBlend}
          error={blendError}
        />
        <VintageField
          value={value.vintage}
          onChange={(next) => set("vintage", next)}
        />
      </div>

      <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
        <SectionEyebrow>Precision calls</SectionEyebrow>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Producer, optional"
            value={value.producer}
            onChange={(e) => set("producer", e.target.value)}
          />
          <TextField
            label="Wine / cuvée, optional"
            value={value.wineName}
            hint={WINE_CUVEE_HINT}
            onChange={(e) => set("wineName", e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <SectionEyebrow>Impression</SectionEyebrow>
        <RatingSlider
          value={value.rating}
          onChange={(rating) => set("rating", rating)}
          error={ratingError}
        />
        <ConfidencePicker
          value={value.confidence}
          onChange={(confidence) => set("confidence", confidence)}
        />
        <TextAreaField
          label="Tasting note (optional)"
          value={value.note ?? ""}
          onChange={(e) => set("note", e.target.value)}
          placeholder="Nose, palate, anything that stood out"
        />
      </div>
    </Card>
  );
}
