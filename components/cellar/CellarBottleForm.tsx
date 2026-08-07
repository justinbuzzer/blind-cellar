import { CellarBottleFormErrors, CellarBottleFormInput } from "@/lib/cellar";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { TextAreaField } from "@/components/TextAreaField";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { BottleFormatField } from "@/components/BottleFormatField";
import { Button } from "@/components/Button";
import { WineIdentityFields } from "@/components/registration/WineIdentityFields";

interface CellarBottleFormProps {
  value: CellarBottleFormInput;
  errors: CellarBottleFormErrors;
  onChange: (value: CellarBottleFormInput) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  submitting: boolean;
  submitError?: string | null;
  /** Secondary action rendered beside the primary submit button — e.g. "Back to cellar". */
  secondaryAction?: React.ReactNode;
  /**
   * "add" shows the Quantity field; "edit" hides it — quantity only ever
   * applies when creating new rows (see README "Personal Cellar" —
   * "Quantity"), never to changing how many copies of an already-existing
   * bottle exist. Defaults to "add" for backward compatibility with any
   * other caller.
   */
  mode?: "add" | "edit";
}

const QUANTITY_HINT = "Add one record for each physical bottle.";

/**
 * Add/edit form for a Personal Cellar bottle (see README "Personal Cellar")
 * — reuses WineIdentityFields unchanged, then adds the cellar-only groups
 * (bottle format, quantity, storage location, personal note). Deliberately
 * no photo, price, or advanced inventory fields — see the feature's
 * exclusion list.
 */
export function CellarBottleForm({
  value,
  errors,
  onChange,
  onSubmit,
  submitLabel,
  submitting,
  submitError,
  secondaryAction,
  mode = "add",
}: CellarBottleFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card className="p-0">
        <WineIdentityFields value={value} errors={errors} onChange={(next) => onChange({ ...value, ...next })} />

        <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
          <SectionEyebrow>Bottle</SectionEyebrow>
          <BottleFormatField
            value={value.bottleFormat}
            otherValue={value.bottleFormatOther}
            onChange={(bottleFormat) => onChange({ ...value, bottleFormat })}
            onOtherChange={(bottleFormatOther) => onChange({ ...value, bottleFormatOther })}
            error={errors.bottleFormat}
            otherError={errors.bottleFormatOther}
          />
          {mode === "add" && (
            <TextField
              label="Quantity"
              hint={QUANTITY_HINT}
              error={errors.quantity}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              className="max-w-[8rem]"
              value={Number.isFinite(value.quantity) ? value.quantity : ""}
              onChange={(e) => {
                const raw = e.target.value;
                onChange({ ...value, quantity: raw === "" ? NaN : Number(raw) });
              }}
            />
          )}
          <TextField
            label="Storage location (optional)"
            value={value.storageLocation}
            maxLength={120}
            placeholder="e.g. Home cellar, Rack B, Wine fridge"
            onChange={(e) => onChange({ ...value, storageLocation: e.target.value })}
          />
        </div>

        <div className="p-5">
          <TextAreaField
            label="Personal note (optional)"
            value={value.personalNote}
            maxLength={500}
            placeholder="Only you can see this, e.g. bought at domaine, open for anniversary"
            onChange={(e) => onChange({ ...value, personalNote: e.target.value })}
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

      <div className="flex flex-col gap-2">
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
        {secondaryAction}
      </div>
    </form>
  );
}
