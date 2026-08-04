import { GrapeBlendMode } from "@/types/tasting";
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
import { GrapeBlendField } from "@/components/GrapeBlendField";
import { Button } from "@/components/Button";

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

  function setGrapeBlendMode(mode: GrapeBlendMode) {
    onChange({ ...value, grapeBlendMode: mode, grapeBlend: "" });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card className="flex flex-col gap-4">
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
            maxLength={100}
            onChange={(e) => set("wineName", e.target.value)}
          />
        </div>

        <GrapeBlendField
          mode={value.grapeBlendMode || "single"}
          value={value.grapeBlend}
          onModeChange={setGrapeBlendMode}
          onValueChange={(next) => set("grapeBlend", next)}
          error={errors.grapeBlendMode ?? errors.grapeBlend}
        />

        <VintageField
          value={value.vintage}
          onChange={(next) => set("vintage", next)}
          error={errors.vintage}
        />

        <TextAreaField
          label="Private note (optional)"
          value={value.notes}
          maxLength={500}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Only you can see this, e.g. where you bought it"
        />
      </Card>

      {submitError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
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
