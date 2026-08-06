"use client";

import { KeyboardEvent, useRef } from "react";

interface ArchiveTabOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface ArchiveTabsProps<T extends string> {
  options: ArchiveTabOption<T>[];
  selected: T;
  onChange: (id: T) => void;
  /** Distinguishes this tablist's DOM ids from another one on the same page (see the outer Your record/This browser tabs vs. the inner Hosted/Joined tabs on /archive). */
  idPrefix?: string;
  label?: string;
}

/**
 * A real ARIA tablist (role="tablist"/"tab", roving tabindex, arrow-key
 * navigation) rather than SegmentedControl's radiogroup semantics — this
 * switches between independent panels, which is what the tab pattern is
 * for. Generic over the tab id type so the same component can drive both the
 * outer Your record/This browser tabs and the inner Hosted/Joined tabs on
 * /archive without either level polluting the other's id union. See README
 * "Tasting archive" / "Account-linked tasting records".
 */
export function ArchiveTabs<T extends string>({
  options,
  selected,
  onChange,
  idPrefix = "archive",
  label = "Tasting archive",
}: ArchiveTabsProps<T>) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const nextIndex =
      e.key === "ArrowRight"
        ? (index + 1) % options.length
        : (index - 1 + options.length) % options.length;
    const next = options[nextIndex];
    onChange(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-2 border-b border-cellar-border">
      {options.map((option, index) => {
        const isSelected = option.id === selected;
        return (
          <button
            key={option.id}
            ref={(el) => {
              tabRefs.current[option.id] = el;
            }}
            role="tab"
            type="button"
            id={`${idPrefix}-tab-${option.id}`}
            aria-selected={isSelected}
            aria-controls={`${idPrefix}-panel-${option.id}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`min-h-[44px] border-b-2 px-1 pb-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold ${
              isSelected
                ? "border-cellar-maroon text-cellar-maroon-dark"
                : "border-transparent text-cellar-muted hover:text-cellar-text"
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="ml-1.5 text-xs text-cellar-muted">({option.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
