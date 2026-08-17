import { BottleFormInput } from "@/lib/supabase/guestActions";
import { Card } from "@/components/Card";
import { TextAreaField } from "@/components/TextAreaField";
import { Button } from "@/components/Button";
import { PhotoUploadField } from "@/components/PhotoUploadField";
import { WineIdentityFields } from "./WineIdentityFields";

export type BottleFormErrors = Partial<Record<keyof BottleFormInput, string>>;

interface BottleFormProps {
  publicId: string;
  guestToken: string;
  value: BottleFormInput;
  errors: BottleFormErrors;
  onChange: (value: BottleFormInput) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  submitting: boolean;
  submitError?: string | null;
}

export function BottleForm({
  publicId,
  guestToken,
  value,
  errors,
  onChange,
  onSubmit,
  submitLabel,
  submitting,
  submitError,
}: BottleFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card className="p-0">
        <WineIdentityFields value={value} errors={errors} onChange={(next) => onChange({ ...value, ...next })} />

        <div className="flex flex-col gap-5 p-5">
          <PhotoUploadField
            publicId={publicId}
            guestToken={guestToken}
            value={value.photoPath}
            onChange={(photoPath) => onChange({ ...value, photoPath })}
          />
          <TextAreaField
            label="Private note (optional)"
            value={value.notes}
            maxLength={500}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
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
