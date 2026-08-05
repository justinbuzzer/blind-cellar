import { useId } from "react";
import {
  TASTING_MODES,
  TASTING_MODE_DESCRIPTIONS,
  TASTING_MODE_LABELS,
  TastingMode,
} from "@/types/tasting";

interface TastingModeFieldProps {
  value: TastingMode | "";
  onChange: (mode: TastingMode) => void;
  error?: string;
}

/**
 * Radio-card selector for the two tasting formats, shown once at session
 * creation and never editable afterwards. Each card always shows both the
 * mode's title and full description — the host must see the trade-off
 * before creating the session, not just a short label.
 */
export function TastingModeField({ value, onChange, error }: TastingModeFieldProps) {
  const groupId = useId();
  const errorId = `${groupId}-error`;

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium text-cellar-text">Tasting format</legend>
      <div
        className="mt-2 flex flex-col gap-3"
        role="radiogroup"
        aria-label="Tasting format"
      >
        {TASTING_MODES.map((mode) => {
          const selected = value === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(mode)}
              className={`relative flex flex-col gap-1.5 rounded-sm border px-4 py-4 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold ${
                selected
                  ? "border-cellar-maroon bg-cellar-bg"
                  : "border-cellar-border bg-white hover:border-cellar-maroon/40"
              }`}
            >
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-3 left-0 w-0.5 bg-cellar-gold"
                />
              )}
              <span className="flex items-center gap-2 font-display text-lg font-semibold text-cellar-maroon-dark">
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-cellar-maroon" : "border-cellar-border"
                  }`}
                >
                  {selected && (
                    <span className="h-2 w-2 rounded-full bg-cellar-maroon" />
                  )}
                </span>
                {TASTING_MODE_LABELS[mode]}
              </span>
              <span className="pl-6 text-sm leading-relaxed text-cellar-muted">
                {TASTING_MODE_DESCRIPTIONS[mode]}
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-cellar-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
