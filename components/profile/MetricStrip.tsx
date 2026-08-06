interface Figure {
  label: string;
  value: string;
}

/**
 * Quiet horizontal editorial figures with fine dividers, stacking cleanly on
 * narrow screens via flex-wrap — the same treatment as the existing archive
 * summary bar (components/archive/ArchiveSummaryBar.tsx), generalized here
 * so both "At a glance" and "Blind palate" can use it without duplicating
 * the border/divider markup. Never a chart, gauge, or KPI card.
 */
export function MetricStrip({ figures }: { figures: Figure[] }) {
  return (
    <div className="flex flex-wrap divide-x divide-cellar-border border-y border-cellar-border">
      {figures.map((figure) => (
        <div key={figure.label} className="min-w-[140px] flex-1 px-4 py-3 first:pl-0">
          <p className="font-display text-xl font-semibold text-cellar-maroon-dark sm:text-2xl">{figure.value}</p>
          <p className="text-xs uppercase tracking-[0.1em] text-cellar-muted">{figure.label}</p>
        </div>
      ))}
    </div>
  );
}
