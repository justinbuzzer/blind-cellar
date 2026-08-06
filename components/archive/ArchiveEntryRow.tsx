import { ReactNode } from "react";
import Link from "next/link";
import { ArchiveEntry } from "@/lib/archive";
import { StatusChip } from "@/components/StatusChip";
import { TASTING_MODE_LABELS } from "@/types/tasting";

interface ArchiveEntryRowProps {
  entry: ArchiveEntry;
  /** Which "Back to …" context View report should carry — see the FROM THE ARCHIVE / FROM YOUR RECORD banners on /results. */
  reportContext?: "archive" | "account";
  /** Optional trailing content — a claim affordance or an "Available on this browser only" label (see README "Account-linked tasting records"). */
  action?: ReactNode;
}

function formatTastingDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * One row in the tasting ledger-style archive list (see README "Tasting
 * archive") — plain editorial rows separated by fine dividers, not catalogue
 * cards. Wine of the Night is never fabricated: when the resolved report had
 * no eligible ratings, entry.wineOfTheNight is null and this shows the exact
 * required "No group rating recorded" copy instead. Shared unchanged by both
 * the browser archive and the account archive (see lib/archive.ts) — they
 * produce the same ArchiveEntry shape, so this row never needs to know which
 * one it's rendering.
 */
export function ArchiveEntryRow({ entry, reportContext = "archive", action }: ArchiveEntryRowProps) {
  return (
    <li className="flex flex-col gap-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-muted">
          {formatTastingDate(entry.tastingDate)} · {TASTING_MODE_LABELS[entry.tastingMode]}
        </p>
        <StatusChip tone={entry.role === "host" ? "active" : "neutral"}>
          {entry.role === "host" ? "Host" : "Participant"}
        </StatusChip>
      </div>

      <h3 className="font-display text-xl font-semibold leading-snug text-cellar-maroon-dark">
        {entry.title}
      </h3>

      <p className="text-sm text-cellar-muted">
        {entry.bottleCount} {entry.bottleCount === 1 ? "bottle" : "bottles"} ·{" "}
        {entry.participantCount} {entry.participantCount === 1 ? "participant" : "participants"}
      </p>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-gold">
          Wine of the Night
        </p>
        {entry.wineOfTheNight ? (
          <p className="mt-1 text-sm text-cellar-text">
            <span className="font-medium">{entry.wineOfTheNight.bottleLabel}</span> ·{" "}
            {entry.wineOfTheNight.wineIdentity}
          </p>
        ) : (
          <p className="mt-1 text-sm text-cellar-muted">No group rating recorded</p>
        )}
      </div>

      <Link
        href={`/results/${entry.publicId}?from=${reportContext}`}
        className="inline-flex min-h-[44px] w-fit items-center gap-1.5 text-sm font-medium text-cellar-maroon underline-offset-4 transition-colors hover:text-cellar-maroon-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
      >
        View report <span aria-hidden="true">→</span>
      </Link>

      {action}
    </li>
  );
}
