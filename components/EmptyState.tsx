import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

/** Calm empty-state block — serif heading, plain explanation, one next action. No illustrations/icons. */
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed border-cellar-border px-6 py-10 text-center">
      <h3 className="font-display text-lg font-semibold text-cellar-maroon-dark">{title}</h3>
      <p className="text-sm text-cellar-muted">{message}</p>
      {action}
    </div>
  );
}
