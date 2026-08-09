import Link from "next/link";

/**
 * Small nav link to the participant results hub — see README "Results
 * reveal". Always rendered (unlike HostControlsLink, which is host-only):
 * every participant is eligible to see revealed bottles' results, so there
 * is no token check to gate this on.
 */
export function ResultsLink({ href, className = "" }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="View bottle results"
      className={`inline-flex min-h-[44px] items-center gap-1 rounded-sm px-2 text-sm font-medium text-cellar-muted transition-colors hover:bg-cellar-maroon/5 hover:text-cellar-maroon focus:outline-none focus:ring-2 focus:ring-cellar-gold ${className}`}
    >
      Results
    </Link>
  );
}
