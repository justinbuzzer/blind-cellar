import { Button } from "./Button";
import { HomeLink } from "./navigation/HomeLink";

interface UnavailableScreenProps {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}

/**
 * Shared calm error/invalid-access screen — invalid or missing token,
 * Supabase misconfiguration, "not found", "already revealed", etc.
 * Consolidates what used to be a near-identical `UnavailableScreen` function
 * hand-duplicated in every page that could hit one of these states. A
 * restrained gold rule marks the state without red/alarm styling — these are
 * calm access/availability messages, not destructive-action errors.
 */
export function UnavailableScreen({
  title,
  message,
  actionHref,
  actionLabel,
}: UnavailableScreenProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <HomeLink />
      <div className="w-full border-t border-cellar-gold/40 pt-5">
        <h1 className="font-display text-2xl font-semibold text-cellar-maroon-dark">{title}</h1>
        <p className="mt-2 text-sm text-cellar-muted">{message}</p>
      </div>
      {actionHref && actionLabel && (
        <a href={actionHref}>
          <Button>{actionLabel}</Button>
        </a>
      )}
    </main>
  );
}
