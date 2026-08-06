"use client";

import { KeyboardEvent, useRef } from "react";
import { ArchiveTabId } from "@/lib/archive";

interface ArchiveTabOption {
  id: ArchiveTabId;
  label: string;
  count: number;
}

interface ArchiveTabsProps {
  options: ArchiveTabOption[];
  selected: ArchiveTabId;
  onChange: (id: ArchiveTabId) => void;
}

/**
 * A real ARIA tablist (role="tablist"/"tab", roving tabindex, arrow-key
 * navigation) rather than SegmentedControl's radiogroup semantics — this
 * switches between two independent panels (Hosted by you / Joined by you),
 * which is what the tab pattern is for. See README "Tasting archive".
 */
export function ArchiveTabs({ options, selected, onChange }: ArchiveTabsProps) {
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
    <div role="tablist" aria-label="Tasting archive" className="flex gap-2 border-b border-cellar-border">
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
            id={`archive-tab-${option.id}`}
            aria-selected={isSelected}
            aria-controls={`archive-panel-${option.id}`}
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
            <span className="ml-1.5 text-xs text-cellar-muted">({option.count})</span>
          </button>
        );
      })}
    </div>
  );
}
