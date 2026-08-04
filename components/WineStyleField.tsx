import { WINE_STYLES, WINE_STYLE_LABELS, WineStyle } from "@/types/tasting";

interface WineStyleFieldProps {
  value: WineStyle | "";
  onChange: (value: WineStyle) => void;
  error?: string;
}

/**
 * Wine style picker (Bubbles/White/Red/Sweet/Other). A dedicated component
 * rather than reusing SegmentedControl: five options need to wrap onto two
 * rows on narrow screens, whereas SegmentedControl always lays its options
 * out in a single row.
 */
export function WineStyleField({ value, onChange, error }: WineStyleFieldProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-cellar-text">Wine style</legend>
      <div
        className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5"
        role="radiogroup"
        aria-label="Wine style"
      >
        {WINE_STYLES.map((style) => {
          const selected = style === value;
          return (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(style)}
              className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cellar-gold ${
                selected
                  ? "border-cellar-maroon bg-cellar-maroon text-white"
                  : "border-cellar-border bg-white text-cellar-text hover:border-cellar-maroon/40"
              }`}
            >
              {WINE_STYLE_LABELS[style]}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
