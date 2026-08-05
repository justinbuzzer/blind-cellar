import { BottleFormInput } from "@/lib/supabase/guestActions";
import {
  COUNTRY_OPTIONS,
  regionOptionsForCountry,
  resetRegionIfInvalid,
} from "@/lib/wineReferenceData";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { SelectField } from "@/components/SelectField";
import { TextAreaField } from "@/components/TextAreaField";
import { VintageField } from "@/components/VintageField";
import { GrapeBlendField, GrapeBlendFormValue } from "@/components/GrapeBlendField";
import { WineStyleField } from "@/components/WineStyleField";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { Button } from "@/components/Button";

const WINE_CUVEE_HINT =
  "Add the specific wine name, vineyard, cru, or appellation where relevant — e.g. Nuits-Saint-Georges, Margaux, or Santa Rita Hills.";

export type BottleFormErrors = Partial<Record<keyof BottleFormInput, string>>;

interface BottleFormProps {
  value: BottleFormInput;
  errors: BottleFormErrors;
  onChange: (value: BottleFormInput) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  submitting: boolean;
  submitError?: string | null;
}

export function BottleForm({
  value,
  errors,
  onChange,
  onSubmit,
  submitLabel,
  submitting,
  submitError,
}: BottleFormProps) {
  function set<K extends keyof BottleFormInput>(key: K, next: BottleFormInput[K]) {
    onChange({ ...value, [key]: next });
  }

  function setCountry(nextCountry: string) {
    onChange({
      ...value,
      country: nextCountry,
      region: resetRegionIfInvalid(nextCountry, value.region),
    });
  }

  function setGrapeBlend(next: GrapeBlendFormValue) {
    onChange({ ...value, ...next });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card className="p-0">
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
              label="Region / appellation"
              value={value.region}
              error={errors.region}
              placeholder={value.country ? "Select region" : "Select country first"}
              disabled={!value.country}
              options={regionOptionsForCountry(value.country)}
              onChange={(e) => set("region", e.target.value)}
            />
          </div>
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

        <div className="p-5">
          <TextAreaField
            label="Private note (optional)"
            value={value.notes}
            maxLength={500}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Only you can see this, e.g. where you bought it"
          />
        </div>
      </Card>

      {submitError && (
        <p
          role="alert"
          className="rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger"
        >
          {submitError}
        </p>
      )}

      <Button type="submit" fullWidth disabled={submitting}>
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
