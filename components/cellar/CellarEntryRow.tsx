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
  onDelete?: () => void;
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
export function CellarEntryRow({ row, session, onEdit, onDelete, onReturn, onConsume }: CellarEntryRowProps) {
  const canReturn = row.status === "reserved" && session?.status === "registration";
  const canConsume = row.status === "reserved" && session?.status === "revealed";
  const identity = cellarWineIdentityLabel(row);

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

      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-semibold leading-snug text-cellar-maroon-dark">
          {identity}
        </h3>
        {row.status === "available" && (
          <div className="flex shrink-0 gap-1">
            {onEdit && (
              <IconButton label={`Edit ${identity}`} onClick={onEdit}>
                <PencilIcon />
              </IconButton>
            )}
            {onDelete && (
              <IconButton label={`Delete ${identity}`} onClick={onDelete}>
                <TrashIcon />
              </IconButton>
            )}
          </div>
        )}
      </div>

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

/**
 * Compact icon-only control (see README "Personal Cellar" — "Deleting a
 * bottle") — 44px touch target, native `title` tooltip, and an
 * identity-specific `aria-label` so a screen reader announces which bottle
 * an Edit/Delete button acts on, matching the pattern already used for
 * TastingOrderList's Move up/down controls.
 */
function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-cellar-border text-cellar-text transition-colors duration-150 hover:border-cellar-maroon/40 hover:text-cellar-maroon focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="h-5 w-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 3.5a2.121 2.121 0 0 1 3 3L7 16l-4 1 1-4 9.5-9.5Z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="h-5 w-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1a1.5 1.5 0 0 1 1.5 1.5V6m-6.5 0 .6 10.2a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4L14.5 6"
      />
    </svg>
  );
}
