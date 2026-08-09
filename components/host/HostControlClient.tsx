"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { QRCodeCard } from "@/components/QRCodeCard";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { StatusChip } from "@/components/StatusChip";
import { ImageBand } from "@/components/ImageBand";
import { TastingOrderList } from "@/components/host/TastingOrderList";
import { SeenHostBottleRow } from "@/components/host/SeenHostBottleRow";
import { FullBlindHostBottleRow } from "@/components/host/FullBlindHostBottleRow";
import { BottleProgressControl } from "@/components/host/BottleProgressControl";
import { HomeLink } from "@/components/navigation/HomeLink";
import { ArchiveLink } from "@/components/navigation/ArchiveLink";
import { AccountNav } from "@/components/navigation/AccountNav";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hostControlImage } from "@/lib/appImages";
import { WINE_STYLE_LABELS } from "@/types/tasting";
import { formatSeenRatingStatus } from "@/lib/seenHostControls";
import { formatGuessProgressTitle, formatProgressAccessibleLabel } from "@/lib/hostProgress";
import { bottleLabel } from "@/lib/codes";
import {
  friendlyRpcError,
  HostActiveBottleDTO,
  HostBottleDTO,
  HostGuestDTO,
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
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showRevealBottleConfirm, setShowRevealBottleConfirm] = useState(false);
  const [showEndSeenConfirm, setShowEndSeenConfirm] = useState(false);
  const [confirmingSeenWineId, setConfirmingSeenWineId] = useState<string | null>(null);
  const [confirmingFullBlindWineId, setConfirmingFullBlindWineId] = useState<string | null>(null);
  const [revealingBottle, setRevealingBottle] = useState(false);
  const [revealingFullBlindBottle, setRevealingFullBlindBottle] = useState(false);
  const [revealingSeenRatings, setRevealingSeenRatings] = useState(false);
  const [endingSeen, setEndingSeen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(true);
  const [joinUrl, setJoinUrl] = useState("");

  const { session } = initialData;
  const tastingMode = session.tastingMode;
  const completedCount = useMemo(
    () => guests.filter((g) => g.completedAt !== null).length,
    [guests]
  );
  const confirmingSeenWine = wines.find((w) => w.id === confirmingSeenWineId) ?? null;
  const confirmingFullBlindWine = wines.find((w) => w.id === confirmingFullBlindWineId) ?? null;

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
        .select("id, display_name, completed_at")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });
      if (data) {
        setGuests(
          data.map((g) => ({
            id: g.id,
            displayName: g.display_name,
            completedAt: g.completed_at,
          }))
        );
      }
    }

    async function refetchWines() {
      // Goes through the host session RPC (not a direct table select) because
      // wineStyle/tastingOrder are deliberately excluded from the anon column
      // grant on `wines` (see supabase/schema.sql) — the RPC is the only path
      // that can return them, and it re-validates the host token itself.
      try {
        const response = await fetch("/api/host/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId, hostToken }),
        });
        if (!response.ok) return;
        const data: HostSessionResponse = await response.json();
        setWines(data.wines);
        setActiveBottle(data.activeBottle);
      } catch {
        // Realtime will retry on the next change; a transient fetch failure
        // here isn't worth surfacing as an error banner.
      }
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
  }, [publicId, session.id, hostToken]);

  // Polling fallback for the active bottle's submitted count — see the
  // ACTIVE_BOTTLE_POLL_MS comment above for why this isn't realtime-driven.
  useEffect(() => {
    if (tastingMode !== "course_reveal" || status !== "collecting") return;

    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch("/api/host/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId, hostToken }),
        });
        if (!response.ok || cancelled) return;
        const data: HostSessionResponse = await response.json();
        if (!cancelled) setActiveBottle(data.activeBottle);
      } catch {
        // Next poll will retry.
      }
    }

    const intervalId = setInterval(poll, ACTIVE_BOTTLE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [publicId, hostToken, tastingMode, status]);

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
      try {
        const response = await fetch("/api/host/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId, hostToken }),
        });
        if (!response.ok || cancelled) return;
        const data: HostSessionResponse = await response.json();
        if (!cancelled) {
          setWines(data.wines);
        }
      } catch {
        // Next poll will retry.
      }
    }

    const intervalId = setInterval(poll, SEEN_PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [publicId, hostToken, tastingMode, status]);

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
      if (data.sessionRevealed) {
        setStatus("revealed");
        setActiveBottle(null);
      } else {
        // The next active bottle will arrive via the realtime-triggered
        // refetch (the wines UPDATE this just caused) or the poll above.
        setActiveBottle(null);
      }
      setShowRevealBottleConfirm(false);
      setRevealingBottle(false);
    } catch {
      setActionError(friendlyRpcError(null));
      setRevealingBottle(false);
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

      <ImageBand image={hostControlImage} className="hidden h-36 rounded-sm sm:block" />

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

      {status !== "revealed" && (
        <Card className="flex flex-col gap-3">
          <SectionEyebrow>Invite the table</SectionEyebrow>
          <QRCodeCard url={joinUrl} joinCode={session.joinCode} />
        </Card>
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
          </div>
        </>
      )}

      {status === "collecting" && (
        <>
          {tastingMode !== "seen" && (
            <div className="flex flex-col gap-2">
              <SectionEyebrow>The table ({wines.length})</SectionEyebrow>
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
          )}

          <Card className="flex flex-col gap-2">
            <SectionEyebrow>Participants ({guests.length})</SectionEyebrow>
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
          </Card>

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
                </div>
              </div>
            </>
          )}

          {tastingMode === "course_reveal" && (
            <>
              {activeBottle ? (
                <Card className="flex flex-col gap-3">
                  <div>
                    <SectionEyebrow>Active bottle</SectionEyebrow>
                    <p className="mt-1 font-display text-xl font-semibold text-cellar-maroon-dark">
                      {activeBottle.anonymousCode}
                    </p>
                    <p className="text-sm text-cellar-muted">
                      Position {activeBottle.position} of {activeBottle.totalBottles}
                    </p>
                  </div>
                  <p className="text-sm text-cellar-muted">
                    {activeBottle.submittedCount} of {activeBottle.totalParticipants}{" "}
                    participants submitted
                  </p>
                </Card>
              ) : (
                <Card className="text-sm text-cellar-muted">
                  Every bottle has been revealed.
                </Card>
              )}

              {wines.some((w) => w.revealedAt !== null) && (
                <div className="flex flex-col gap-2">
                  <SectionEyebrow>Revealed bottles</SectionEyebrow>
                  <Card className="p-0">
                    <ol className="divide-y divide-cellar-border">
                      {wines
                        .filter((w) => w.revealedAt !== null)
                        .map((wine) => (
                          <li
                            key={wine.id}
                            className="flex items-center justify-between gap-3 px-4 py-3"
                          >
                            <span className="text-sm font-medium text-cellar-text">
                              {wine.anonymousCode}
                            </span>
                            <Link
                              href={`/host/${publicId}/bottle/${wine.id}/result?token=${encodeURIComponent(hostToken)}`}
                            >
                              <Button variant="secondary">View results</Button>
                            </Link>
                          </li>
                        ))}
                    </ol>
                  </Card>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-cellar-border pt-5">
                <SectionEyebrow>Host actions</SectionEyebrow>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Link href={`/session/${publicId}/active`}>
                    <Button variant="secondary" fullWidth>
                      Enter my guesses
                    </Button>
                  </Link>
                  {activeBottle && (
                    <Button fullWidth onClick={() => setShowRevealBottleConfirm(true)}>
                      Reveal {activeBottle.anonymousCode}
                    </Button>
                  )}
                  <Link href={`/host/${publicId}/leaderboard?token=${encodeURIComponent(hostToken)}`}>
                    <Button variant="secondary" fullWidth>
                      View leaderboard
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
