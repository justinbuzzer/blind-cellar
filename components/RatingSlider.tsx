import { useId, useState } from "react";
import { Modal } from "./Modal";

interface RatingSliderProps {
  value: number | null;
  onChange: (value: number) => void;
  error?: string;
  disabled?: boolean;
}

const MIN = 70;
const MAX = 100;

/**
 * Reference bands for the "What do scores mean?" popover — a condensed,
 * own-words paraphrase of the classic Robert Parker / Wine Advocate
 * 100-point scale. Bands below 70 (50-69, "unacceptable"/"below average")
 * are intentionally omitted: those wines are considered flawed and this app
 * never expects one to actually be tasted, so MIN is set to 70 rather than
 * merely hiding the low end of a wider scale.
 */
const SCORE_BANDS: { range: string; label: string }[] = [
  { range: "96–100", label: "Extraordinary" },
  { range: "90–95", label: "Outstanding" },
  { range: "85–89", label: "Very good to excellent" },
  { range: "80–84", label: "Good to very good" },
  { range: "70–79", label: "Average — sound and drinkable" },
];

export function RatingSlider({ value, onChange, error, disabled }: RatingSliderProps) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const current = value ?? MIN;
  const [showScale, setShowScale] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <label htmlFor={fieldId} className="text-sm font-medium text-cellar-text">
            Rating
          </label>
          <button
            type="button"
            onClick={() => setShowScale(true)}
            className="text-xs text-cellar-muted underline decoration-cellar-border underline-offset-2 transition-colors duration-150 hover:text-cellar-maroon focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
          >
            What do scores mean?
          </button>
        </div>
        <span
          className="text-2xl font-semibold text-cellar-maroon"
          aria-hidden="true"
        >
          {value ?? "—"}
        </span>
      </div>
      <input
        id={fieldId}
        type="range"
        className="rating-slider h-2 w-full cursor-pointer appearance-none rounded-full bg-cellar-border"
        min={MIN}
        max={MAX}
        step={1}
        value={current}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        aria-valuetext={value !== null ? String(value) : "not set"}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between text-xs text-cellar-text/50">
        <span>{MIN}</span>
        <span>{MAX}</span>
      </div>
      {error && (
        <p id={errorId} className="text-xs font-medium text-cellar-danger">
          {error}
        </p>
      )}
      {showScale && (
        <Modal title="What do scores mean?" onClose={() => setShowScale(false)}>
          <p className="text-cellar-muted">
            Based on the classic 100-point wine scale (Robert Parker / Wine
            Advocate). Scores below 70 are reserved for flawed or
            undrinkable wines, so this scale starts at 70.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {SCORE_BANDS.map((band) => (
              <li key={band.range} className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-cellar-text">{band.range}</span>
                <span className="text-right text-cellar-muted">{band.label}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
