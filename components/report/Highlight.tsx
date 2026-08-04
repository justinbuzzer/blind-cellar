import { ReactNode } from "react";

interface HighlightProps {
  label: string;
  icon: string;
  title: string;
  detail?: ReactNode;
  tie?: boolean;
}

/** A prominent spotlight card for a report headline, e.g. "Wine of the Night". */
export function Highlight({ label, icon, title, detail, tie }: HighlightProps) {
  return (
    <div className="rounded-xl border border-cellar-gold/50 bg-cellar-gold/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-cellar-gold">
        {icon} {label}
        {tie ? " (tie)" : ""}
      </p>
      <p className="mt-1 text-lg font-semibold text-cellar-maroon-dark">
        {title}
      </p>
      {detail && <p className="mt-0.5 text-sm text-cellar-text/70">{detail}</p>}
    </div>
  );
}
