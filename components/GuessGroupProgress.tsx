"use client";

import { useEffect, useRef, useState } from "react";
import {
  NO_ELIGIBLE_PARTICIPANTS_MESSAGE,
  formatGroupProgressLine,
  formatGroupProgressUpdateAnnouncement,
} from "@/lib/hostProgress";
import { HostGuessProgressDTO } from "@/lib/supabase/types";

interface GuessGroupProgressProps {
  /** Null while loading, not the host, or not yet authorised (Seen/wrong mode/unreleased Course bottle) — renders nothing in every one of those cases. */
  progress: HostGuessProgressDTO | null;
}

/**
 * Host-only live aggregate submission count shown above the host's own
 * Full blind/Course-by-course guess form — see README "Host per-bottle
 * response progress" — "Host guess screen group progress". Never rendered
 * for an ordinary participant: the caller only ever passes a non-null
 * `progress` once the host-only get_host_guess_progress fetch has
 * succeeded, which itself rejects any non-host guest token. Plain text
 * only — no chart, gauge, percentage, progress bar, avatar, badge, or
 * participant name.
 */
export function GuessGroupProgress({ progress }: GuessGroupProgressProps) {
  const [announcement, setAnnouncement] = useState("");
  const previousCountsRef = useRef<string | null>(null);

  useEffect(() => {
    if (!progress) return;
    const key = `${progress.submittedCount}/${progress.eligibleCount}`;
    // Never announce on the very first value a bottle receives — only on a
    // genuine in-place change, so switching bottles/mounting doesn't trigger
    // an unwanted screen-reader announcement.
    if (previousCountsRef.current !== null && previousCountsRef.current !== key) {
      setAnnouncement(
        formatGroupProgressUpdateAnnouncement(progress.submittedCount, progress.eligibleCount)
      );
    }
    previousCountsRef.current = key;
  }, [progress]);

  if (!progress) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-cellar-muted">Your private guess</p>
      <p className="text-xs font-medium text-cellar-text/70">
        {progress.eligibleCount === 0
          ? NO_ELIGIBLE_PARTICIPANTS_MESSAGE
          : formatGroupProgressLine(progress.submittedCount, progress.eligibleCount)}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
