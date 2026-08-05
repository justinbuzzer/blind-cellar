interface LoadingStateProps {
  message?: string;
}

/**
 * Full-screen calm loading state — a text status plus a discreet pulsing
 * gold rule (`.cellar-shimmer`, defined in globals.css and gated on
 * prefers-reduced-motion) instead of a bare spinner or plain "Loading…"
 * text.
 */
export function LoadingState({ message = "Preparing the table…" }: LoadingStateProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <span aria-hidden="true" className="cellar-shimmer h-px w-16 bg-cellar-gold" />
      <p role="status" aria-live="polite" className="text-sm text-cellar-muted">
        {message}
      </p>
    </main>
  );
}
