"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  BottleResponseKind,
  formatAllSubmittedMessage,
  formatMissingSectionHeading,
  formatProgressStatusLine,
  formatProgressTooltip,
  formatProgressUpdateAnnouncement,
  NO_ELIGIBLE_PARTICIPANTS_MESSAGE,
} from "@/lib/hostProgress";
import { BottleResponseProgressDTO } from "@/lib/supabase/types";

// Matches ACTIVE_BOTTLE_POLL_MS/SEEN_PROGRESS_POLL_MS in HostControlClient —
// wine_guesses has no realtime publication (see that file's comment), so a
// popover left open while a participant submits only picks up the change via
// this poll, not a push update. Only runs while the popover is open.
const PROGRESS_POLL_MS = 5000;

interface BottleProgressControlProps {
  publicId: string;
  hostToken: string;
  wineId: string;
  responseKind: BottleResponseKind;
  /** e.g. "Bottle 3 guess progress" or "Rating progress". */
  title: string;
  /** Optional muted wine-identity context shown under the title (Seen only). */
  subtitle?: string;
  /** Context-specific accessible name, distinct from the shorter hover/focus tooltip. */
  accessibleLabel: string;
}

/**
 * Host-only per-bottle response-progress control (see README "Host
 * per-bottle response progress"): a compact icon button carrying a live
 * "{submitted}/{eligible}" count badge, so the host can see where a bottle
 * stands at a glance without clicking anything. Clicking still opens a
 * temporary detail surface — now instantly, with the badge's already-known
 * count, refreshed in the background — with the safe display names of who
 * hasn't responded yet. Never a guess, a rating value, a score, or any wine
 * identity beyond what the caller already chooses to show via
 * `title`/`subtitle`. Reuses the existing Modal component (the only dialog
 * primitive this app has) for both desktop and mobile, rather than
 * introducing a new anchored-popover positioning system.
 */
export function BottleProgressControl({
  publicId,
  hostToken,
  wineId,
  responseKind,
  title,
  subtitle,
  accessibleLabel,
}: BottleProgressControlProps) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<BottleResponseProgressDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousCountsRef = useRef<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const response = await fetch("/api/host/bottle-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, hostToken, wineId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Couldn't load progress. Try again.");
        return;
      }
      const next = data as BottleResponseProgressDTO;
      setError(null);
      setProgress(next);
      const key = `${next.submittedCount}/${next.eligibleCount}`;
      if (previousCountsRef.current !== null && previousCountsRef.current !== key) {
        setAnnouncement(
          formatProgressUpdateAnnouncement(responseKind, next.submittedCount, next.eligibleCount)
        );
      }
      previousCountsRef.current = key;
    } catch {
      setError("Couldn't load progress. Try again.");
    }
  }, [publicId, hostToken, wineId, responseKind]);

  // Fetch once on mount, independent of the popover being open, so the
  // button already has a count to show as a badge before the host ever
  // clicks it — see the button markup below. Polling only resumes while the
  // popover itself is open (unchanged from before).
  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  useEffect(() => {
    if (!open) return;
    const intervalId = setInterval(fetchProgress, PROGRESS_POLL_MS);
    return () => clearInterval(intervalId);
  }, [open, fetchProgress]);

  function handleClose() {
    setOpen(false);
    setError(null);
    setAnnouncement("");
    previousCountsRef.current = null;
    // Standard non-modal-popover pattern: return focus to the control that
    // opened it, rather than leaving focus on a now-removed dialog.
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={
          progress && progress.eligibleCount > 0
            ? `${accessibleLabel} — ${formatProgressStatusLine(responseKind, progress.submittedCount, progress.eligibleCount)}`
            : accessibleLabel
        }
        title={formatProgressTooltip(responseKind)}
        onClick={() => setOpen(true)}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-cellar-border text-cellar-text transition-colors duration-150 hover:border-cellar-maroon/40 hover:text-cellar-maroon focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
      >
        <ProgressIcon />
        {progress && progress.eligibleCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1.5 rounded-full bg-cellar-maroon px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
          >
            {progress.submittedCount}/{progress.eligibleCount}
          </span>
        )}
      </button>

      {open && (
        <Modal title={title} onClose={handleClose}>
          {subtitle && <p className="-mt-1 mb-2 text-xs text-cellar-muted">{subtitle}</p>}

          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>

          {error ? (
            <p role="alert" className="text-cellar-danger">
              {error}
            </p>
          ) : !progress ? (
            <p className="text-cellar-muted">Loading…</p>
          ) : progress.eligibleCount === 0 ? (
            <p className="text-cellar-muted">{NO_ELIGIBLE_PARTICIPANTS_MESSAGE}</p>
          ) : (
            <>
              <p className="font-medium text-cellar-text">
                {formatProgressStatusLine(responseKind, progress.submittedCount, progress.eligibleCount)}
              </p>
              {progress.missingParticipantNames.length > 0 ? (
                <div className="mt-3 border-t border-cellar-border pt-3">
                  <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-muted">
                    {formatMissingSectionHeading(responseKind)}
                  </p>
                  <ul className="mt-2 max-h-48 overflow-y-auto text-sm text-cellar-text/80">
                    {progress.missingParticipantNames.map((name, index) => (
                      <li key={index} className="py-1">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 text-cellar-muted">{formatAllSubmittedMessage(responseKind)}</p>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function ProgressIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <circle cx="7.2" cy="6.4" r="2.2" />
      <path strokeLinecap="round" d="M2.5 16v-1c0-2.5 2.1-4.5 4.7-4.5s4.7 2 4.7 4.5v1" />
      <circle cx="14" cy="7" r="1.7" />
      <path strokeLinecap="round" d="M13 11.3c2 .2 3.5 1.9 3.5 3.9v.8" />
    </svg>
  );
}
