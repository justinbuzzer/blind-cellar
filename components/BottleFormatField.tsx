import { BOTTLE_FORMATS, BOTTLE_FORMAT_LABELS, BottleFormat } from "@/types/tasting";
import { TextField } from "@/components/TextField";

interface BottleFormatFieldProps {
  value: BottleFormat;
  otherValue: string;
  onChange: (value: BottleFormat) => void;
  onOtherChange: (value: string) => void;
  error?: string;
  otherError?: string;
}

/**
 * Bottle-size picker for Personal Cellar (see README "Personal Cellar") —
 * same fieldset/radiogroup-of-buttons pattern as WineStyleField, so the two
 * controlled-vocabulary pickers in this app read as one consistent control,
 * not two different widgets. "Other" reveals a short free-text detail field.
 */
export function BottleFormatField({
  value,
  otherValue,
  onChange,
  onOtherChange,
  error,
  otherError,
}: BottleFormatFieldProps) {
  return (
    <fieldset className="flex flex-col gap-3">
      <div>
        <legend className="text-sm font-medium text-cellar-text">Bottle format</legend>
        <div
          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5"
          role="radiogroup"
          aria-label="Bottle format"
        >
          {BOTTLE_FORMATS.map((format) => {
            const selected = format === value;
            return (
              <button
                key={format}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(format)}
                className={`min-h-[44px] rounded-sm border px-3 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cellar-gold ${
                  selected
                    ? "border-cellar-maroon bg-cellar-maroon text-white"
                    : "border-cellar-border bg-white text-cellar-text hover:border-cellar-maroon/40"
                }`}
              >
                {BOTTLE_FORMAT_LABELS[format]}
              </button>
            );
          })}
        </div>
        {error && (
          <p className="mt-1 text-sm text-cellar-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      {value === "other" && (
        <TextField
          label="Format detail"
          value={otherValue}
          error={otherError}
          maxLength={60}
          placeholder="e.g. 3L double magnum"
          onChange={(e) => onOtherChange(e.target.value)}
        />
      )}
    </fieldset>
  );
}
