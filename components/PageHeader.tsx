import { ReactNode } from "react";
import { SectionEyebrow } from "./SectionEyebrow";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  supporting?: string;
  /** Optional trailing content, e.g. a StatusChip, right-aligned on wide screens. */
  action?: ReactNode;
  className?: string;
}

/**
 * Editorial page-title block — serif display heading, optional small tracked
 * eyebrow, optional supporting copy — replacing the ad-hoc
 * `<h1 className="text-2xl font-semibold ...">` block that used to be
 * hand-written on every page.
 */
export function PageHeader({ eyebrow, title, supporting, action, className = "" }: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div>
        {eyebrow && <SectionEyebrow>{eyebrow}</SectionEyebrow>}
        <h1 className={`font-display text-3xl font-semibold leading-tight text-cellar-maroon-dark ${eyebrow ? "mt-1.5" : ""}`}>
          {title}
        </h1>
        {supporting && <p className="mt-2 text-sm leading-relaxed text-cellar-muted">{supporting}</p>}
      </div>
      {action}
    </div>
  );
}
