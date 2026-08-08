import { useId } from "react";

interface RatingSliderProps {
  value: number | null;
  onChange: (value: number) => void;
  error?: string;
  disabled?: boolean;
}

const MIN = 50;
const MAX = 100;

export function RatingSlider({ value, onChange, error, disabled }: RatingSliderProps) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const current = value ?? MIN;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={fieldId} className="text-sm font-medium text-cellar-text">
          Rating
        </label>
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
    </div>
  );
}
