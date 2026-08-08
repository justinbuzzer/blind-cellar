import { Confidence, CONFIDENCE_LEVELS } from "@/types/tasting";

interface ConfidencePickerProps {
  value: Confidence;
  onChange: (value: Confidence) => void;
  disabled?: boolean;
}

const LABELS: Record<Confidence, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function ConfidencePicker({ value, onChange, disabled }: ConfidencePickerProps) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-medium text-cellar-text">Confidence</legend>
      <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup">
        {CONFIDENCE_LEVELS.map((level) => {
          const selected = value === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(level)}
              className={`rounded-sm border px-3 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cellar-gold disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-cellar-maroon bg-cellar-maroon text-white"
                  : "border-cellar-border bg-white text-cellar-text hover:border-cellar-maroon/40"
              }`}
            >
              {LABELS[level]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
