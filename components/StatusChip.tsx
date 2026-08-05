import { ReactNode } from "react";

type StatusChipTone = "neutral" | "active" | "success" | "warning";

const TONE_CLASSES: Record<StatusChipTone, string> = {
  neutral: "border-cellar-border text-cellar-muted",
  active: "border-cellar-maroon text-cellar-maroon",
  success: "border-cellar-success text-cellar-success",
  warning: "border-cellar-warning text-cellar-warning",
};

/**
 * Small bordered status label (session stage, rated/unrated, submitted/in
 * progress, ...). Colour is always paired with the text content itself —
 * never the sole way a status is communicated.
 */
export function StatusChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusChipTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
