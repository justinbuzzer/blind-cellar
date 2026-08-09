"use client";

import { useState } from "react";
import { CellarEntryRow, CellarSessionSummary } from "@/components/cellar/CellarEntryRow";
import { cellarBottleFormatLabel, cellarWineIdentityLabel } from "@/lib/cellar";
import {
  CellarBottleGroup,
  formatCellarFormatLine,
  formatCellarGroupStatusLine,
  formatCellarOriginLine,
} from "@/lib/cellarGrouping";
import { CellarBottleRow } from "@/lib/supabase/types";
import { WINE_STYLE_LABELS } from "@/types/tasting";

interface CellarGroupRowProps {
  group: CellarBottleGroup;
  sessionFor: (row: CellarBottleRow) => CellarSessionSummary | null;
  onEdit: (row: CellarBottleRow) => void;
  onDelete: (row: CellarBottleRow) => void;
  onReturn: (row: CellarBottleRow) => void;
  onConsume: (row: CellarBottleRow) => void;
}

/**
 * One My Cellar grouped entry (see README "Personal Cellar" — "Grouped
 * display"). A group of exactly one physical bottle renders through the
 * existing, completely unchanged `CellarEntryRow` — same Edit/Delete/Return/
 * Consume behavior as before this feature. A group of more than one bottle
 * shows a condensed summary line plus an expand toggle that reveals every
 * underlying physical bottle as its own `CellarEntryRow`, each with its own
 * independent actions — this is the "expandable group row" design (see
 * completion report): the safest way to guarantee a multi-bottle group can
 * never silently apply Edit/Delete/Return/Consume to more than the one
 * physical row the user actually meant, because every action still targets
 * one concrete row exactly as it always has.
 */
export function CellarGroupRow({ group, sessionFor, onEdit, onDelete, onReturn, onConsume }: CellarGroupRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { representative, bottleCount, status, bottles } = group;

  if (bottleCount === 1) {
    return (
      <CellarEntryRow
        row={representative}
        session={sessionFor(representative)}
        onEdit={status === "available" ? () => onEdit(representative) : undefined}
        onDelete={status === "available" ? () => onDelete(representative) : undefined}
        onReturn={status === "reserved" ? () => onReturn(representative) : undefined}
        onConsume={status === "reserved" ? () => onConsume(representative) : undefined}
      />
    );
  }

  const identity = cellarWineIdentityLabel(representative);
  const originLine = formatCellarOriginLine(representative);
  const formatLine = formatCellarFormatLine(representative);

  return (
    <li className="flex flex-col gap-2 py-5">
      <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-muted">
        {WINE_STYLE_LABELS[representative.wine_style]} · {cellarBottleFormatLabel(representative)}
      </p>
      <h3 className="font-display text-lg font-semibold leading-snug text-cellar-maroon-dark">{identity}</h3>
      <p className="text-sm text-cellar-muted">{originLine}</p>
      <p className="text-sm text-cellar-muted">{formatLine}</p>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-cellar-text">{formatCellarGroupStatusLine(status, bottleCount)}</p>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-[44px] items-center px-2 text-sm font-medium text-cellar-maroon underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
        >
          {expanded ? "Hide bottles" : `Show ${bottleCount} bottles`}
        </button>
      </div>

      {expanded && (
        <ul className="mt-2 divide-y divide-cellar-border border-l-2 border-cellar-border pl-4">
          {bottles.map((row) => (
            <CellarEntryRow
              key={row.id}
              row={row}
              session={sessionFor(row)}
              onEdit={status === "available" ? () => onEdit(row) : undefined}
              onDelete={status === "available" ? () => onDelete(row) : undefined}
              onReturn={status === "reserved" ? () => onReturn(row) : undefined}
              onConsume={status === "reserved" ? () => onConsume(row) : undefined}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
