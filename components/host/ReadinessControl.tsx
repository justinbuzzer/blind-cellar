"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  EVERYONE_READY_MESSAGE,
  NO_ELIGIBLE_PARTICIPANTS_MESSAGE,
  NOT_READY_POPOVER_TITLE,
  ReadinessGuest,
  formatReadinessAccessibleLabel,
  formatReadinessCountLine,
  formatReadinessUpdateAnnouncement,
  summarizeReadiness,
} from "@/lib/readiness";

interface ReadinessControlProps {
  guests: ReadinessGuest[];
}

/**
 * Host-only readiness progress + popover (see README "Participant readiness
 * confirmation"). Deliberately has no fetch/poll of its own — `guests` is
 * already fetched and realtime-subscribed by the parent (HostControlClient),
 * exactly like the existing "Participants joined" list on the same page — so
 * this component only ever formats/summarizes data it's handed. Rendered
 * directly below the Start tasting button, only while the session is still
 * in the "registration" (pre-start) state.
 */
export function ReadinessControl({ guests }: ReadinessControlProps) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousKeyRef = useRef<string | null>(null);

  const { readyCount, eligibleCount, notReadyNames } = summarizeReadiness(guests);

  useEffect(() => {
    const key = `${readyCount}/${eligibleCount}`;
    // Skip the announcement on first mount — only real changes to an
    // already-shown count should interrupt a polite live region.
    if (previousKeyRef.current !== null && previousKeyRef.current !== key) {
      setAnnouncement(formatReadinessUpdateAnnouncement(readyCount, eligibleCount));
    }
    previousKeyRef.current = key;
  }, [readyCount, eligibleCount]);

  function handleClose() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {eligibleCount === 0 ? (
        <p className="text-sm text-cellar-muted">{NO_ELIGIBLE_PARTICIPANTS_MESSAGE}</p>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={formatReadinessAccessibleLabel(readyCount, eligibleCount)}
          className="-my-3 inline-block py-3 text-sm text-cellar-muted underline decoration-cellar-border underline-offset-2 transition-colors duration-150 hover:text-cellar-maroon focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
        >
          {formatReadinessCountLine(readyCount, eligibleCount)}
        </button>
      )}

      {open && (
        <Modal title={NOT_READY_POPOVER_TITLE} onClose={handleClose}>
          {notReadyNames.length === 0 ? (
            <p className="text-cellar-muted">{EVERYONE_READY_MESSAGE}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-cellar-text/80">
              {notReadyNames.map((name, index) => (
                <li key={index} className="py-1">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}
