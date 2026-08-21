"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { QRCodeCard } from "@/components/QRCodeCard";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { StatusChip } from "@/components/StatusChip";
import { TastingOrderList } from "@/components/host/TastingOrderList";
import { SeenHostBottleRow } from "@/components/host/SeenHostBottleRow";
import { FullBlindHostBottleRow } from "@/components/host/FullBlindHostBottleRow";
import { CourseHostBottleRow } from "@/components/host/CourseHostBottleRow";
import { BottleProgressControl } from "@/components/host/BottleProgressControl";
import { ReadinessControl } from "@/components/host/ReadinessControl";
import { CurrentTastingCard } from "@/components/host/CurrentTastingCard";
import { HomeLink } from "@/components/navigation/HomeLink";
import { ArchiveLink } from "@/components/navigation/ArchiveLink";
import { AccountNav } from "@/components/navigation/AccountNav";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { WINE_STYLE_LABELS } from "@/types/tasting";
import { formatSeenRatingStatus } from "@/lib/seenHostControls";
import {
  formatGuessProgressTitle,
  formatGroupProgressUpdateAnnouncement,
  formatProgressAccessibleLabel,
} from "@/lib/hostProgress";
import { resolveHostCurrentTastingState } from "@/lib/hostCurrentTasting";
import { bottleLabel } from "@/lib/codes";
import {
  friendlyRpcError,
  HostActiveBottleDTO,
  HostBottleDTO,
  HostGuestDTO,
  HostSeenProgressDTO,
  HostSessionResponse,
  RevealFullBlindBottleResponse,
  RevealSeenRatingsResponse,
} from "@/lib/supabase/types";
import {
  SessionStatus,
  TASTING_MODE_DESCRIPTIONS,
  TASTING_MODE_LABELS,
} from "@/types/tasting";

interface HostControlClientProps {
  publicId: string;
  hostToken: string;
  initialData: HostSessionResponse;
  /** True when this session was just created while signed in, but the automatic account link failed — see README "Account-linked tasting records". Never blocks anything; purely an FYI, shown once. */
  accountLinkFailed?: boolean;
}

const STATUS_LABELS: Record<SessionStatus, string> = {
  registration: "Bottle registration open",
  collecting: "Collecting guesses",
  revealed: "Revealed",
};

// While a course_reveal bottle awaits reveal, the host's "N of M submitted"
// count is refreshed by polling rather than realtime — see README "Tasting
// modes": wine_guesses deliberately has no realtime publication or anon
// grant, since Supabase Realtime broadcasts full rows per RLS regardless of
// column grants, and a permissive policy there would leak guess content
// (ratings, country/region guesses) to other participants in real time.
const ACTIVE_BOTTLE_POLL_MS = 5000;

// Same reasoning as ACTIVE_BOTTLE_POLL_MS above, for seen mode's aggregate
// rating-progress count.
const SEEN_PROGRESS_POLL_MS = 5000;

export function HostControlClient({
  publicId,
  hostToken,
  initialData,
  accountLinkFailed = false,
}: HostControlClientProps) {
  const router = useRouter();
  const [showAccountLinkNotice, setShowAccountLinkNotice] = useState(accountLinkFailed);
  const [status, setStatus] = useState<SessionStatus>(initialData.session.status);
  const [guests, setGuests] = useState<HostGuestDTO[]>(initialData.guests);
  const [wines, setWines] = useState<HostBottleDTO[]>(initialData.wines);
  const [activeBottle, setActiveBottle] = useState<HostActiveBottleDTO | null>(
    initialData.activeBottle
  );
  const [seenProgress, setSeenProgress] = useState<HostSeenProgressDTO | null>(
    initialData.seenProgress
  );
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showRevealBottleConfirm, setShowRevealBottleConfirm] = useState(false);
  const [showEndSeenConfirm, setShowEndSeenConfirm] = useState(false);
  const [confirmingSeenWineId, setConfirmingSeenWineId] = useState<string | null>(null);
  const [confirmingFullBlindWineId, setConfirmingFullBlindWineId] = useState<string | null>(null);
  const [revealingBottle, setRevealingBottle] = useState(false);
  const [revealingFullBlindBottle, setRevealingFullBlindBottle] = useState(false);
  const [releasingWineId, setReleasingWineId] = useState<string | null>(null);
  const [revealingSeenRatings, setRevealingSeenRatings] = useState(false);
  const [endingSeen, setEndingSeen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(true);
  const [joinUrl, setJoinUrl] = useState("");

  // Shared de-dupe guard for the three independent triggers that can all
  // fetch /api/host/session (the full get_host_session re-fetch) within a
  // short window of each other: the wines-table realtime handler below, and
  // the two 5s poll fallbacks further down. A realtime change and the next
  // poll tick can otherwise both fire the same expensive re-fetch moments
  // apart — this skips a fetch that would just re-confirm what the last one
  // already returned, without changing what any of the three callers do
  // with the data once they actually get it.
  const lastHostSessionFetchAtRef = useRef(0);
  const HOST_SESSION_FETCH_GUARD_MS = 2000;

  const fetchHostSession = useCallback(async (): Promise<HostSessionResponse | null> => {
    if (Date.now() - lastHostSessionFetchAtRef.current < HOST_SESSION_FETCH_GUARD_MS) {
      return null;
    }
    lastHostSessionFetchAtRef.current = Date.now();
    try {
      const response = await fetch("/api/host/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, hostToken }),
      });
      if (!response.ok) return null;
      return (await response.json()) as HostSessionResponse;
    } catch {
      // Realtime/the next poll tick will retry — a transient fetch failure
      // here isn't worth surfacing as an error banner.
      return null;
    }
  }, [publicId, hostToken]);

  const { session } = initialData;
  const tastingMode = session.tastingMode;
  const completedCount = useMemo(
    () => guests.filter((g) => g.completedAt !== null).length,
    [guests]
  );
  const confirmingSeenWine = wines.find((w) => w.id === confirmingSeenWineId) ?? null;
  const confirmingFullBlindWine = wines.find((w) => w.id === confirmingFullBlindWineId) ?? null;

  // Current tasting summary (see README "Current tasting") — purely a
  // display computation over data already fetched above via the
  // host-token-authorized get_host_session RPC; introduces no new query and
  // carries no authority of its own (every action it can trigger reuses the
  // exact same handlers/confirmations as the detailed sections below, which
  // independently re-validate everything server-side).
  const currentTastingState = useMemo(
    () =>
      status === "registration"
        ? null
        : resolveHostCurrentTastingState({
            tastingMode,
            status,
            wines,
            completedCount,
            eligibleCount: guests.length,
            activeBottle,
            seenProgress,
          }),
    [status, tastingMode, wines, completedCount, guests.length, activeBottle, seenProgress]
  );

  const [currentTastingAnnouncement, setCurrentTastingAnnouncement] = useState("");
  const prevCurrentTastingProgressRef = useRef<{
    bottleKey: string;
    completed: number;
    eligible: number;
  } | null>(null);

  useEffect(() => {
    if (currentTastingState?.kind !== "awaiting_responses") return;
    const progress = currentTastingState.progress;
    const bottleKey = currentTastingState.currentBottle?.label ?? "session";
    const prev = prevCurrentTastingProgressRef.current;
    if (
      prev &&
      prev.bottleKey === bottleKey &&
      (prev.completed !== progress.completedCount || prev.eligible !== progress.eligibleCount)
    ) {
      setCurrentTastingAnnouncement(
        formatGroupProgressUpdateAnnouncement(
          progress.completedCount,
          progress.eligibleCount,
          progress.noun === "rated" ? "rating" : "guess"
        )
      );
    }
    prevCurrentTastingProgressRef.current = {
      bottleKey,
      completed: progress.completedCount,
      eligible: progress.eligibleCount,
    };
  }, [currentTastingState]);

  function handleCurrentTastingRevealClick(wineId: string) {
    if (tastingMode === "full_blind") {
      setConfirmingFullBlindWineId(wineId);
    } else if (tastingMode === "course_reveal") {
      setShowRevealBottleConfirm(true);
    }
  }

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join/${publicId}`);
  }, [publicId]);

  // Strip accountLinkFailed from the URL after reading it once, so a refresh
  // or a shared link never repeats a one-time notice — see README
  // "Account-linked tasting records". accountLinkFailed is only ever true on
  // the very first render (it comes from a query param this same effect
  // removes), so this intentionally behaves like a mount-only effect.
  useEffect(() => {
    if (!accountLinkFailed) return;
    router.replace(`/host/${publicId}?token=${encodeURIComponent(hostToken)}`);
  }, [accountLinkFailed, hostToken, publicId, router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    async function refetchGuests() {
      if (!supabase) return;
      const { data } = await supabase
        .from("guests")
        .select("id, display_name, completed_at, ready_to_begin_at")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });
      if (data) {
        setGuests(
          data.map((g) => ({
            id: g.id,
            displayName: g.display_name,
            completedAt: g.completed_at,
            readyToBeginAt: g.ready_to_begin_at,
          }))
        );
      }
    }

    async function refetchWines() {
      // Goes through the host session RPC (not a direct table select) because
      // wineStyle/tastingOrder are deliberately excluded from the anon column
      // grant on `wines` (see supabase/schema.sql) — the RPC is the only path
      // that can return them, and it re-validates the host token itself.
      // Guarded by fetchHostSession's shared de-dupe window — see its comment.
      const data = await fetchHostSession();
      if (!data) return;
      setWines(data.wines);
      setActiveBottle(data.activeBottle);
      setSeenProgress(data.seenProgress);
    }

    const channel = supabase
      .channel(`host-session-${publicId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasting_sessions",
          filter: `public_id=eq.${publicId}`,
        },
        (payload) => {
          const next = payload.new as { status?: SessionStatus };
          if (next.status) setStatus(next.status);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "guests",
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          refetchGuests();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wines",
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          refetchWines();
        }
      )
      .subscribe((subStatus) => {
        setRealtimeOk(subStatus === "SUBSCRIBED" || subStatus === "CLOSED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [publicId, session.id, hostToken, fetchHostSession]);

  // Polling fallback for the active bottle's submitted count — see the
  // ACTIVE_BOTTLE_POLL_MS comment above for why this isn't realtime-driven.
  useEffect(() => {
    if (tastingMode !== "course_reveal" || status !== "collecting") return;

    let cancelled = false;
    async function poll() {
      // Guarded by fetchHostSession's shared de-dupe window, so a poll tick
      // landing just after the realtime handler already refetched (or after
      // the other poll below) is a no-op instead of a second round trip.
      const data = await fetchHostSession();
      if (data && !cancelled) setActiveBottle(data.activeBottle);
    }

    const intervalId = setInterval(poll, ACTIVE_BOTTLE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [tastingMode, status, fetchHostSession]);

  // Polling fallback for seen mode's aggregate rating progress, and also the
  // per-bottle rating counts/group ratings shown in the Seen Host Controls
  // list (see README "Seen Host Controls") — same reasoning as the
  // course_reveal poll above: wine_guesses changes aren't realtime-broadcast
  // at all, and a rating submission never touches the `wines` table itself
  // (which the realtime effect above does listen to), so this is the only
  // way the host's per-bottle "N of M rated" counts and revealed group
  // ratings stay current while participants are actively rating.
  useEffect(() => {
    if (tastingMode !== "seen" || status !== "collecting") return;

    let cancelled = false;
    async function poll() {
      // Guarded by fetchHostSession's shared de-dupe window — see the
      // course_reveal poll above for the full explanation.
      const data = await fetchHostSession();
      if (data && !cancelled) {
        setWines(data.wines);
        setSeenProgress(data.seenProgress);
      }
    }

    const intervalId = setInterval(poll, SEEN_PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [tastingMode, status, fetchHostSession]);

  async function handleStartTasting() {
    setStarting(true);
    setActionError(null);
    try {
      const response = await fetch("/api/host/start-tasting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, hostToken }),
      });
      const data = await response.json();
      if (!response.ok) {
        setActionError(data.error ?? "Couldn't start the tasting.");
        setStarting(false);
        return;
      }
      setStatus("collecting");
      setShowStartConfirm(false);
      setStarting(false);

      // The session flips to "collecting" here, which is when course-reveal
      // sessions first have an active bottle — refetch immediately instead of
      // waiting for the next poll/realtime tick, so the host doesn't briefly
      // see the "every bottle revealed" fallback for an untouched session.
      if (tastingMode === "course_reveal") {
        try {
          const sessionResponse = await fetch("/api/host/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publicId, hostToken }),
          });
          if (sessionResponse.ok) {
            const sessionData: HostSessionResponse = await sessionResponse.json();
            setWines(sessionData.wines);
            setActiveBottle(sessionData.activeBottle);
          }
        } catch {
          // The poll/realtime refetch will pick this up shortly after.
        }
      }

    } catch {
      setActionError(friendlyRpcError(null));
      setStarting(false);
    }
  }

  async function handleRevealBottle() {
    if (!activeBottle) return;
    setRevealingBottle(true);
    setActionError(null);
    try {
      const response = await fetch("/api/host/reveal-bottle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, hostToken, wineId: activeBottle.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setActionError(data.error ?? "Couldn't reveal that bottle.");
        setRevealingBottle(false);
        return;
      }
      const revealedWineId = activeBottle.id;
      setWines((prev) =>
        prev.map((w) => (w.id === revealedWineId ? { ...w, revealedAt: new Date().toISOString() } : w))
      );
      if (data.sessionRevealed) {
        setStatus("revealed");
      }
      // No bottle is active again until the host explicitly releases the
      // next one from the bottle list below (see README "Course-by-course
      // host-selected release") — there is no auto-advance.
      setActiveBottle(null);
      setShowRevealBottleConfirm(false);
      setRevealingBottle(false);
    } catch {
      setActionError(friendlyRpcError(null));
      setRevealingBottle(false);
    }
  }

  // Releases directly on click, with no confirmation step — unlike
  // Start/Reveal/End (all genuinely irreversible), releasing a bottle never
  // reveals its identity and bottles can be released in any order, so there
  // is no real mistake for a confirm dialog to guard against. releasingWineId
  // still disables the row's own button and shows "Releasing…" while the
  // request is in flight, so a double-click can't fire two requests.
  async function handleReleaseBottle(wineId: string) {
    setReleasingWineId(wineId);
    setActionError(null);
    try {
      const response = await fetch("/api/host/release-course-bottle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, hostToken, wineId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setActionError(data.error ?? "Couldn't release that bottle.");
        setReleasingWineId(null);
        return;
      }
      setReleasingWineId(null);
      // Refetch immediately for the fully-populated activeBottle DTO
      // (position/totalBottles/submittedCount/totalParticipants) rather than
      // waiting for the next poll/realtime tick — same pattern
      // handleStartTasting already uses for course_reveal's first bottle.
      try {
        const sessionResponse = await fetch("/api/host/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId, hostToken }),
        });
        if (sessionResponse.ok) {
          const sessionData: HostSessionResponse = await sessionResponse.json();
          setWines(sessionData.wines);
          setActiveBottle(sessionData.activeBottle);
        }
      } catch {
        // The poll/realtime refetch will pick this up shortly after.
      }
    } catch {
      setActionError(friendlyRpcError(null));
      setReleasingWineId(null);
    }
  }

  async function handleRevealFullBlindBottle(wineId: string) {
    setRevealingFullBlindBottle(true);
    setActionError(null);
    try {
      const response = await fetch("/api/host/reveal-full-blind-bottle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, hostToken, wineId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setActionError(data.error ?? "Couldn't reveal that bottle.");
        setRevealingFullBlindBottle(false);
        return;
      }
      const revealed = data as RevealFullBlindBottleResponse;
      setWines((prev) =>
        prev.map((w) => (w.id === wineId ? { ...w, revealedAt: revealed.revealedAt } : w))
      );
      if (revealed.sessionRevealed) {
        setStatus("revealed");
      }
      setConfirmingFullBlindWineId(null);
      setRevealingFullBlindBottle(false);
    } catch {
      setActionError(friendlyRpcError(null));
      setRevealingFullBlindBottle(false);
    }
  }

  async function handleRevealSeenRatings(wineId: string) {
    setRevealingSeenRatings(true);
    setActionError(null);
    try {
      const response = await fetch("/api/host/reveal-seen-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, hostToken, wineId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setActionError(data.error ?? "Couldn't reveal ratings for that wine.");
        setRevealingSeenRatings(false);
        return;
      }
      const revealed = data as RevealSeenRatingsResponse;
      setWines((prev) =>
        prev.map((w) =>
          w.id === wineId && w.seen
            ? {
                ...w,
                seen: {
                  ...w.seen,
                  ratingsRevealedAt: revealed.ratingsRevealedAt,
                  ratedCount: revealed.ratedCount,
                  eligibleCount: revealed.eligibleCount,
                  groupRating: revealed.groupRating,
                },
              }
            : w
        )
      );
      setConfirmingSeenWineId(null);
      setRevealingSeenRatings(false);
    } catch {
      setActionError(friendlyRpcError(null));
      setRevealingSeenRatings(false);
    }
  }

  async function handleEndSeenTasting() {
    setEndingSeen(true);
    setActionError(null);
    try {
      const response = await fetch("/api/host/end-seen-tasting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, hostToken }),
      });
      const data = await response.json();
      if (!response.ok) {
        setActionError(data.error ?? "Couldn't end the tasting.");
        setEndingSeen(false);
        return;
      }
      setStatus("revealed");
      setShowEndSeenConfirm(false);
      setEndingSeen(false);
    } catch {
      setActionError(friendlyRpcError(null));
      setEndingSeen(false);
    }
  }

  const statusTone = status === "revealed" ? "success" : status === "collecting" ? "active" : "neutral";

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <ArchiveLink />
        <AccountNav />
      </div>

      {showAccountLinkNotice && (
        <p
          role="status"
          className="flex items-center justify-between gap-3 rounded-sm border border-cellar-gold/40 bg-cellar-gold/10 px-3 py-2 text-sm text-cellar-text/80"
        >
          <span>Your tasting was created, but it could not yet be added to your account record.</span>
          <button
            type="button"
            onClick={() => setShowAccountLinkNotice(false)}
            aria-label="Dismiss"
            className="min-h-[44px] shrink-0 px-2 text-cellar-muted hover:text-cellar-text focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
          >
            Dismiss
          </button>
        </p>
      )}

      <div>
        <SectionEyebrow>Host control</SectionEyebrow>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-cellar-maroon-dark">
          {session.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-cellar-muted">
          <span>
            {new Date(session.tastingDate).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          <span aria-hidden="true">·</span>
          <span>{TASTING_MODE_LABELS[tastingMode]}</span>
          <span aria-hidden="true">·</span>
          <StatusChip tone={statusTone}>{STATUS_LABELS[status]}</StatusChip>
        </div>
        <p className="mt-2 text-sm text-cellar-muted">{TASTING_MODE_DESCRIPTIONS[tastingMode]}</p>
      </div>

      {!realtimeOk && (
        <p className="flex items-center justify-between gap-2 rounded-sm border border-cellar-gold/40 bg-cellar-gold/10 px-3 py-2 text-sm text-cellar-text/80">
          Live updates aren&rsquo;t connected right now.
          <Button variant="ghost" onClick={() => router.refresh()}>
            Refresh
          </Button>
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-center">
          <Stat label="Bottles" value={wines.length} />
          <Stat
            label="Submissions"
            value={status === "registration" ? "—" : `${completedCount} / ${guests.length}`}
          />
        </div>
      </Card>

      {currentTastingState && (
        <CurrentTastingCard
          state={currentTastingState}
          leaderboardHref={`/host/${publicId}/leaderboard?token=${encodeURIComponent(hostToken)}`}
          recapHref={`/host/${publicId}/recap?token=${encodeURIComponent(hostToken)}`}
          resultsHref={`/results/${publicId}`}
          onRevealClick={handleCurrentTastingRevealClick}
          onEndSeenTastingClick={() => setShowEndSeenConfirm(true)}
          announcement={currentTastingAnnouncement}
        />
      )}

      {status === "registration" && (
        <Card className="flex flex-col gap-3">
          <SectionEyebrow>Invite the table</SectionEyebrow>
          <QRCodeCard url={joinUrl} joinCode={session.joinCode} />
        </Card>
      )}

      {status === "collecting" && (
        <details className="rounded-sm border border-cellar-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
            <span>Invite the table</span>
            <span className="text-cellar-muted">{session.joinCode}</span>
          </summary>
          <div className="flex flex-col gap-3 border-t border-cellar-border px-3 py-3">
            <QRCodeCard url={joinUrl} joinCode={session.joinCode} />
          </div>
        </details>
      )}

      {status === "registration" && (
        <>
          <div className="flex flex-col gap-2">
            <SectionEyebrow>The table ({wines.length})</SectionEyebrow>
            {wines.length === 0 && (
              <Card className="text-sm text-cellar-muted">
                No bottles registered yet. Everyone, including you, can
                register a bottle below.
              </Card>
            )}
          </div>

          {wines.length > 0 && (
            <TastingOrderList
              publicId={publicId}
              hostToken={hostToken}
              wines={wines}
              onReordered={setWines}
            />
          )}

          <Card className="flex flex-col gap-2">
            <SectionEyebrow>Participants joined ({guests.length})</SectionEyebrow>
            {guests.length === 0 ? (
              <p className="text-sm text-cellar-muted">
                No one else has joined yet. Share the link, QR code, or join
                code above.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {guests.map((guest) => (
                  <li key={guest.id} className="text-sm text-cellar-text/80">
                    {guest.displayName}
                    {guest.id === session.hostGuestId ? " (you)" : ""}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="flex flex-col gap-3 border-t border-cellar-border pt-5">
            <SectionEyebrow>Host actions</SectionEyebrow>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link href={`/register/${publicId}`}>
                <Button variant="secondary" fullWidth>
                  Register my bottle
                </Button>
              </Link>
              <Button
                fullWidth
                disabled={wines.length === 0}
                onClick={() => setShowStartConfirm(true)}
              >
                Start tasting
              </Button>
            </div>
            <ReadinessControl guests={guests} />
          </div>
        </>
      )}

      {status === "collecting" && (
        <>
          {tastingMode !== "seen" && (
            <details className="rounded-sm border border-cellar-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
                <span>The table ({wines.length})</span>
                <span className="text-cellar-muted">Bottle order &amp; labels</span>
              </summary>
              <div className="flex flex-col gap-2 border-t border-cellar-border px-3 py-3">
                <Card className="p-0">
                  <ol className="divide-y divide-cellar-border">
                    {wines.map((wine) => (
                      <li key={wine.id} className="flex items-center gap-3 px-4 py-3">
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cellar-maroon/10 text-sm font-semibold text-cellar-maroon"
                        >
                          {wine.tastingOrder}
                        </span>
                        <span className="text-sm font-medium text-cellar-text">{wine.anonymousCode}</span>
                        <span className="ml-auto rounded-full border border-cellar-border px-2 py-0.5 text-xs text-cellar-muted">
                          {WINE_STYLE_LABELS[wine.wineStyle]}
                        </span>
                        {(tastingMode === "full_blind" ||
                          (tastingMode === "course_reveal" && activeBottle?.id === wine.id)) && (
                          <BottleProgressControl
                            publicId={publicId}
                            hostToken={hostToken}
                            wineId={wine.id}
                            responseKind="guess"
                            title={formatGuessProgressTitle(wine.bottleNumber)}
                            accessibleLabel={formatProgressAccessibleLabel("guess", {
                              bottleNumber: wine.bottleNumber,
                            })}
                          />
                        )}
                      </li>
                    ))}
                  </ol>
                </Card>
                <p className="text-xs text-cellar-muted">
                  Registration is closed and bottle numbers are final.
                </p>
              </div>
            </details>
          )}

          <details className="rounded-sm border border-cellar-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
              <span>Participants ({guests.length})</span>
              {tastingMode !== "seen" && (
                <span className="text-cellar-muted">
                  {guests.filter((g) => g.completedAt).length} submitted
                </span>
              )}
            </summary>
            <div className="border-t border-cellar-border px-3 py-3">
              {guests.length === 0 ? (
                <p className="text-sm text-cellar-muted">No one has joined yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {guests.map((guest) => (
                    <li
                      key={guest.id}
                      className="flex items-center justify-between text-sm text-cellar-text/80"
                    >
                      <span>
                        {guest.displayName}
                        {guest.id === session.hostGuestId ? " (you)" : ""}
                      </span>
                      {tastingMode !== "seen" && (
                        <span
                          className={
                            guest.completedAt
                              ? "font-medium text-cellar-maroon"
                              : "text-cellar-text/50"
                          }
                        >
                          {guest.completedAt ? "Submitted" : "In progress"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          {tastingMode === "full_blind" && (
            <>
              <div className="flex flex-col gap-2">
                <SectionEyebrow>Results reveal</SectionEyebrow>
                <p className="text-sm text-cellar-muted">
                  Reveal each bottle whenever you&rsquo;re ready, in any order.
                  A bottle&rsquo;s wine details and participant scores stay
                  private until you reveal it.
                </p>
                <Card className="p-0">
                  <ol className="divide-y divide-cellar-border">
                    {wines.map((wine) => (
                      <FullBlindHostBottleRow
                        key={wine.id}
                        wine={wine}
                        publicId={publicId}
                        hostToken={hostToken}
                        onRevealClick={setConfirmingFullBlindWineId}
                      />
                    ))}
                  </ol>
                </Card>
              </div>
              <div className="flex flex-col gap-3 border-t border-cellar-border pt-5">
                <SectionEyebrow>Host actions</SectionEyebrow>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Link href={`/tasting/${publicId}`}>
                    <Button variant="secondary" fullWidth>
                      Enter my guesses
                    </Button>
                  </Link>
                  <Link href={`/host/${publicId}/leaderboard?token=${encodeURIComponent(hostToken)}`}>
                    <Button variant="secondary" fullWidth>
                      View leaderboard
                    </Button>
                  </Link>
                  <Link href={`/host/${publicId}/recap?token=${encodeURIComponent(hostToken)}`}>
                    <Button variant="secondary" fullWidth>
                      View tasting recap
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          )}

          {tastingMode === "course_reveal" && (
            <>
              <div className="flex flex-col gap-2">
                <SectionEyebrow>Bottles</SectionEyebrow>
                <p className="text-sm text-cellar-muted">
                  Release any eligible bottle next, in any order — the
                  tasting order above is an organisational aid only and
                  doesn&rsquo;t restrict release order. Only one bottle can
                  be active at a time.
                </p>
                <Card className="p-0">
                  <ol className="divide-y divide-cellar-border">
                    {wines.map((wine) => (
                      <CourseHostBottleRow
                        key={wine.id}
                        wine={wine}
                        isActive={activeBottle?.id === wine.id}
                        activeWineId={activeBottle?.id ?? null}
                        publicId={publicId}
                        hostToken={hostToken}
                        onReleaseClick={handleReleaseBottle}
                        releasing={releasingWineId === wine.id}
                      />
                    ))}
                  </ol>
                </Card>
              </div>

              <div className="flex flex-col gap-3 border-t border-cellar-border pt-5">
                <SectionEyebrow>Host actions</SectionEyebrow>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Link href={`/session/${publicId}/active`}>
                    <Button variant="secondary" fullWidth>
                      Enter my guesses
                    </Button>
                  </Link>
                  <Link href={`/host/${publicId}/leaderboard?token=${encodeURIComponent(hostToken)}`}>
                    <Button variant="secondary" fullWidth>
                      View leaderboard
                    </Button>
                  </Link>
                  <Link href={`/host/${publicId}/recap?token=${encodeURIComponent(hostToken)}`}>
                    <Button variant="secondary" fullWidth>
                      View tasting recap
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          )}

          {tastingMode === "seen" && (
            <>
              <p className="text-sm text-cellar-muted">
                All bottles are visible. Guests can revise their ratings until
                you end the tasting or you reveal a wine&rsquo;s group rating.
              </p>
              <div className="flex flex-col gap-2">
                <SectionEyebrow>The table ({wines.length})</SectionEyebrow>
                <Card className="p-0">
                  <ol className="divide-y divide-cellar-border">
                    {wines.map((wine) => (
                      <SeenHostBottleRow
                        key={wine.id}
                        wine={wine}
                        publicId={publicId}
                        hostToken={hostToken}
                        onRevealClick={setConfirmingSeenWineId}
                      />
                    ))}
                  </ol>
                </Card>
              </div>
              <div className="flex flex-col gap-3 border-t border-cellar-border pt-5">
                <SectionEyebrow>Host actions</SectionEyebrow>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Link href={`/session/${publicId}/seen`}>
                    <Button variant="secondary" fullWidth>
                      Rate my bottles
                    </Button>
                  </Link>
                  <Button fullWidth onClick={() => setShowEndSeenConfirm(true)}>
                    End tasting and reveal ratings
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {status === "revealed" && (
        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-cellar-muted">
            Results are revealed. Everyone can now see the answer key and the
            full report.
          </p>
          <Link href={`/results/${publicId}`}>
            <Button>View shared results</Button>
          </Link>
          {tastingMode !== "seen" && (
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Link href={`/host/${publicId}/leaderboard?token=${encodeURIComponent(hostToken)}`} className="flex-1">
                <Button variant="secondary" fullWidth>
                  View final leaderboard
                </Button>
              </Link>
              <Link href={`/host/${publicId}/recap?token=${encodeURIComponent(hostToken)}`} className="flex-1">
                <Button variant="secondary" fullWidth>
                  View tasting recap
                </Button>
              </Link>
            </div>
          )}
        </Card>
      )}

      {actionError && (
        <p role="alert" className="rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger">
          {actionError}
        </p>
      )}

      {showStartConfirm && (
        <Modal
          title="Start tasting?"
          onClose={() => !starting && setShowStartConfirm(false)}
        >
          <p>
            Bottle registration will close. Contributors will no longer be
            able to edit or remove their bottles. The current tasting order
            will be locked.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowStartConfirm(false)}
              disabled={starting}
            >
              Cancel
            </Button>
            <Button onClick={handleStartTasting} disabled={starting}>
              {starting ? "Starting…" : "Start tasting"}
            </Button>
          </div>
        </Modal>
      )}

      {showRevealBottleConfirm && activeBottle && (
        <Modal
          title={`Reveal ${activeBottle.anonymousCode}?`}
          onClose={() => !revealingBottle && setShowRevealBottleConfirm(false)}
        >
          <p>
            This will reveal the wine, contributor, scores, and group ratings
            for this bottle. Participants who have not submitted will not
            receive a score for it. You cannot undo this action.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowRevealBottleConfirm(false)}
              disabled={revealingBottle}
            >
              Cancel
            </Button>
            <Button onClick={handleRevealBottle} disabled={revealingBottle}>
              {revealingBottle ? "Revealing…" : "Reveal bottle"}
            </Button>
          </div>
        </Modal>
      )}

      {confirmingFullBlindWineId && confirmingFullBlindWine && (
        <Modal
          title={`Reveal ${bottleLabel(confirmingFullBlindWine.bottleNumber)}?`}
          onClose={() => !revealingFullBlindBottle && setConfirmingFullBlindWineId(null)}
        >
          <p>
            This will make this bottle&rsquo;s wine details and participant
            scores available to eligible participants.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmingFullBlindWineId(null)}
              disabled={revealingFullBlindBottle}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleRevealFullBlindBottle(confirmingFullBlindWineId)}
              disabled={revealingFullBlindBottle}
            >
              {revealingFullBlindBottle ? "Revealing…" : "Reveal results"}
            </Button>
          </div>
        </Modal>
      )}

      {confirmingSeenWineId && confirmingSeenWine?.seen && (
        <Modal
          title="Reveal ratings for this wine?"
          onClose={() => !revealingSeenRatings && setConfirmingSeenWineId(null)}
        >
          <p>Participants will be able to see the group rating for this wine.</p>
          <p className="mt-2 text-cellar-muted">
            {formatSeenRatingStatus(confirmingSeenWine.seen.ratedCount, confirmingSeenWine.seen.eligibleCount)}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmingSeenWineId(null)}
              disabled={revealingSeenRatings}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleRevealSeenRatings(confirmingSeenWineId)}
              disabled={revealingSeenRatings}
            >
              {revealingSeenRatings ? "Revealing…" : "Reveal ratings"}
            </Button>
          </div>
        </Modal>
      )}

      {showEndSeenConfirm && (
        <Modal
          title="End seen tasting?"
          onClose={() => !endingSeen && setShowEndSeenConfirm(false)}
        >
          <p>
            This will lock all ratings and reveal the group results.
            Participants will no longer be able to change their ratings.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowEndSeenConfirm(false)}
              disabled={endingSeen}
            >
              Cancel
            </Button>
            <Button onClick={handleEndSeenTasting} disabled={endingSeen}>
              {endingSeen ? "Ending…" : "End tasting and reveal results"}
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-display text-xl font-semibold text-cellar-maroon-dark">{value}</p>
      <p className="text-xs text-cellar-muted">{label}</p>
    </div>
  );
}
