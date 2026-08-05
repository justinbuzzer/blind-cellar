import { ReactNode } from "react";

/** Small uppercase tracked label used above a page/section title. Inter, claret — never gold (reserved for fine accents/rules, not body-scale text). */
export function SectionEyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-xs font-medium uppercase tracking-[0.2em] text-cellar-maroon ${className}`}>
      {children}
    </p>
  );
}
