import { useState } from "react";
import { WineIdentityInput } from "@/types/tasting";
import {
  COUNTRY_OPTIONS,
  regionOptionsForCountry,
  resetRegionIfInvalid,
} from "@/lib/wineReferenceData";
import { getAppellations, hasAppellations } from "@/lib/appellations";
import { TextField } from "@/components/TextField";
import { SelectField } from "@/components/SelectField";
import { VintageField } from "@/components/VintageField";
import { GrapeBlendField, GrapeBlendFormValue } from "@/components/GrapeBlendField";
import { WineStyleField } from "@/components/WineStyleField";
import { SectionEyebrow } from "@/components/SectionEyebrow";

const WINE_CUVEE_HINT = "Enter the wine name or cuvée.";

const APPELLATION_HINT = "Optional. Select the recognised appellation if applicable.";
const APPELLATION_CLEARED_MESSAGE = "Appellation cleared because the region changed.";

export type WineIdentityErrors = Partial<Record<keyof WineIdentityInput, string>>;

interface WineIdentityFieldsProps {
  value: WineIdentityInput;
  errors: WineIdentityErrors;
  onChange: (value: WineIdentityInput) => void;
}

/**
 * The wine-identity field groups (Origin / Identity / Producer & cuvée)
 * shared, unchanged, by the tasting bottle form and the Personal Cellar
 * bottle form (see README "Personal Cellar") — extracted from BottleForm so
 * the two can never drift into divergent markup or validation. Callers
 * supply their own `<Card>`/border wrapper and append any fields of their
 * own (a private note, or bottle format/storage/note) after this.
 */
export function WineIdentityFields({ value, errors, onChange }: WineIdentityFieldsProps) {
  const [clearedMessage, setClearedMessage] = useState("");

  function set<K extends keyof WineIdentityInput>(key: K, next: WineIdentityInput[K]) {
    onChange({ ...value, [key]: next });
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
    <>
      <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
        <SectionEyebrow>Origin</SectionEyebrow>
        <WineStyleField
          value={value.wineStyle}
          onChange={(next) => set("wineStyle", next)}
          error={errors.wineStyle}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Country"
            value={value.country}
            error={errors.country}
            placeholder="Select country"
            options={COUNTRY_OPTIONS}
            onChange={(e) => setCountry(e.target.value)}
          />
          <SelectField
            label="Region"
            value={value.region}
            error={errors.region}
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
            error={errors.appellation}
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
            otherGrapeSelected: value.otherGrapeSelected,
          }}
          onChange={setGrapeBlend}
          error={errors.grapeBlendMode ?? errors.grapeBlend}
        />
        <VintageField
          value={value.vintage}
          onChange={(next) => set("vintage", next)}
          error={errors.vintage}
        />
      </div>

      <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
        <SectionEyebrow>Producer &amp; cuvée</SectionEyebrow>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Producer"
            value={value.producer}
            error={errors.producer}
            maxLength={100}
            onChange={(e) => set("producer", e.target.value)}
          />
          <TextField
            label="Wine / cuvée"
            value={value.wineName}
            error={errors.wineName}
            hint={WINE_CUVEE_HINT}
            maxLength={100}
            onChange={(e) => set("wineName", e.target.value)}
          />
        </div>
      </div>
    </>
  );
}
