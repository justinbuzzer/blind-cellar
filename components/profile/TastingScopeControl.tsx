"use client";

import { SegmentedControl } from "@/components/SegmentedControl";
import { TastingScope } from "@/lib/profile";

export type ScopeSaveState = "idle" | "saving" | "saved" | "error";

interface TastingScopeControlProps {
  value: TastingScope;
  onChange: (value: TastingScope) => void;
  saveState: ScopeSaveState;
}

/**
 * The persistent Seen-tasting scope toggle (see README "Core scope rule:
 * Seen tasting filter"). Reuses the existing accessible SegmentedControl
 * (radiogroup semantics, announces the selected option) rather than
 * inventing new tab/switch markup. The save-state line is a live region so
 * a screen reader announces "Saved." the same way sighted users see it.
 */
export function TastingScopeControl({ value, onChange, saveState }: TastingScopeControlProps) {
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label="Tasting scope"
        value={value}
        onChange={onChange}
        options={[
          { value: "blind_only", label: "Blind tastings only" },
          { value: "include_seen", label: "Include Seen tastings" },
        ]}
      />
      <p className="text-xs text-cellar-muted">
        This changes your tasting and rating summaries. Blind-identification metrics always use blind tastings
        only.
      </p>
      <p role="status" aria-live="polite" className="min-h-[1em] text-xs font-medium">
        {saveState === "saving" && <span className="text-cellar-muted">Saving…</span>}
        {saveState === "saved" && <span className="text-cellar-success">Saved.</span>}
        {saveState === "error" && <span className="text-cellar-danger">Couldn&rsquo;t save — please try again.</span>}
      </p>
    </div>
  );
}
