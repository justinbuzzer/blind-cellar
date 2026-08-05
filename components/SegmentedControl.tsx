interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: SegmentedControlOption<T>[];
  onChange: (value: T) => void;
}

/** A small 2+ option toggle styled like a radio group, e.g. Vintage year/NV or Single variety/Blend. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-cellar-text">{label}</legend>
      <div
        className="mt-2 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-[44px] rounded-sm border px-3 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cellar-gold ${
                selected
                  ? "border-cellar-maroon bg-cellar-maroon text-white"
                  : "border-cellar-border bg-white text-cellar-text hover:border-cellar-maroon/40"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
