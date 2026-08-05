import { ReactNode } from "react";

interface HighlightProps {
  label: string;
  title: string;
  detail?: ReactNode;
  tie?: boolean;
}

/**
 * A featured report headline, e.g. "Wine of the Night" — styled as a fine
 * label-like card (hairline border, serif title) rather than a trophy or
 * medal graphic.
 */
export function Highlight({ label, title, detail, tie }: HighlightProps) {
  return (
    <div className="rounded-sm border border-cellar-gold/40 p-5 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-cellar-maroon">
        {label}
        {tie ? " (tie)" : ""}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold text-cellar-maroon-dark">
        {title}
      </p>
      {detail && <p className="mt-1 text-sm text-cellar-muted">{detail}</p>}
    </div>
  );
}
