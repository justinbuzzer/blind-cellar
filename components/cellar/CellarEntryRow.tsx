import { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { StatusChip } from "@/components/StatusChip";
import { cellarBottleFormatLabel, cellarWineIdentityLabel } from "@/lib/cellar";
import { compactWineLocationLabel } from "@/lib/appellations";
import { CellarBottleRow } from "@/lib/supabase/types";
import { WINE_STYLE_LABELS } from "@/types/tasting";

export interface CellarSessionSummary {
  publicId: string;
  title: string;
  tastingDate: string;
  status: "registration" | "collecting" | "revealed";
}

interface CellarEntryRowProps {
  row: CellarBottleRow;
  /** The reserved or consumed session, whichever applies to this row's status — resolved by the caller. */
  session: CellarSessionSummary | null;
  onEdit?: () => void;
  onReturn?: () => void;
  onConsume?: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * One row in the Personal Cellar ledger (see README "Personal Cellar") —
 * a plain editorial row separated by a fine divider, matching
 * ArchiveEntryRow's treatment rather than a generic product/inventory card.
 * Status is always conveyed by the `StatusChip` label text, never by chip
 * color alone.
 */
export function CellarEntryRow({ row, session, onEdit, onReturn, onConsume }: CellarEntryRowProps) {
  const canReturn = row.status === "reserved" && session?.status === "registration";
  const canConsume = row.status === "reserved" && session?.status === "revealed";

  return (
    <li className="flex flex-col gap-2 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-muted">
          {WINE_STYLE_LABELS[row.wine_style]} · {cellarBottleFormatLabel(row)}
        </p>
        {row.status !== "available" && (
          <StatusChip tone={row.status === "reserved" ? "warning" : "neutral"}>
            {row.status === "reserved" ? "Reserved" : "Consumed"}
          </StatusChip>
        )}
      </div>

      <h3 className="font-display text-lg font-semibold leading-snug text-cellar-maroon-dark">
        {cellarWineIdentityLabel(row)}
      </h3>

      <p className="text-sm text-cellar-muted">
        {compactWineLocationLabel(row)}
        {row.storage_location && <> · {row.storage_location}</>}
      </p>

      {row.status === "reserved" && (
        <p className="text-sm text-cellar-text">
          {session ? (
            <>
              Reserved for <span className="font-medium">{session.title}</span> ·{" "}
              {formatDate(session.tastingDate)}
            </>
          ) : (
            "Reserved for a tasting"
          )}
        </p>
      )}

      {row.status === "consumed" && (
        <p className="text-sm text-cellar-text">
          Consumed {row.consumed_at ? formatDate(row.consumed_at) : ""}
          {session && (
            <>
              {" "}
              · <span className="font-medium">{session.title}</span> · {formatDate(session.tastingDate)}
            </>
          )}
        </p>
      )}

      <ActionRow>
        {row.status === "available" && onEdit && (
          <Button type="button" variant="secondary" onClick={onEdit}>
            Edit
          </Button>
        )}
        {canReturn && onReturn && (
          <Button type="button" variant="secondary" onClick={onReturn}>
            Return to cellar
          </Button>
        )}
        {canConsume && onConsume && (
          <Button type="button" variant="secondary" onClick={onConsume}>
            Mark as consumed
          </Button>
        )}
        {row.status === "consumed" && session?.status === "revealed" && (
          <Link href={`/results/${session.publicId}`}>
            <Button type="button" variant="secondary">
              View tasting report
            </Button>
          </Link>
        )}
      </ActionRow>
    </li>
  );
}

function ActionRow({ children }: { children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean);
  if (items.length === 0) return null;
  return <div className="mt-1 flex flex-wrap gap-2">{items}</div>;
}
