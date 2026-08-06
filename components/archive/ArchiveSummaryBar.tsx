import { ArchiveSummary } from "@/lib/archive";

interface ArchiveSummaryBarProps {
  summary: ArchiveSummary;
}

/**
 * Three quiet editorial figures, never a chart/gauge/badge (see README
 * "Tasting archive"). Blind tasting accuracy only appears when at least one
 * entry in the current tab actually has scoring data — never shown as 0%.
 */
export function ArchiveSummaryBar({ summary }: ArchiveSummaryBarProps) {
  const figures = [
    { label: "Completed tastings", value: String(summary.completedCount) },
    { label: "Bottles tasted", value: String(summary.bottlesTasted) },
  ];
  if (summary.averageAccuracyPercent !== null) {
    figures.push({
      label: "Blind tasting accuracy",
      value: `${summary.averageAccuracyPercent}%`,
    });
  }

  return (
    <div className="flex flex-wrap divide-x divide-cellar-border border-y border-cellar-border">
      {figures.map((figure) => (
        <div key={figure.label} className="min-w-[140px] flex-1 px-4 py-3 first:pl-0">
          <p className="font-display text-2xl font-semibold text-cellar-maroon-dark">
            {figure.value}
          </p>
          <p className="text-xs uppercase tracking-[0.1em] text-cellar-muted">{figure.label}</p>
        </div>
      ))}
    </div>
  );
}
