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
import { HomeLink } from "@/components/navigation/HomeLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hostControlImage } from "@/lib/appImages";
import { WINE_STYLE_LABELS } from "@/types/tasting";
import {
  friendlyRpcError,
  HostActiveBottleDTO,
  HostBottleDTO,
  HostGuestDTO,
  HostSeenProgressDTO,
  HostSessionResponse,
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
}: HostControlClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus>(initialData.session.status);
  const [guests, setGuests] = useState<HostGuestDTO[]>(initialData.guests);
  const [wines, setWines] = useState<HostBottleDTO[]>(initialData.wines);
  const [activeBottle, setActiveBottle] = useState<HostActiveBottleDTO | null>(
    initialData.activeBottle
  );
  const [seenProgress, setSeenProgress] = useState<HostSeenProgressDTO | null>(
    initialData.seenProgress
  );
  const [showRevealConfirm, setShowRevealConfirm] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showRevealBottleConfirm, setShowRevealBottleConfirm] = useState(false);
  const [showEndSeenConfirm, setShowEndSeenConfirm] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealingBottle, setRevealingBottle] = useState(false);
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

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join/${publicId}`);
  }, [publicId]);

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
        setSeenProgress(data.seenProgress);
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

  // Polling fallback for seen mode's aggregate rating progress — same
  // reasoning as the course_reveal poll above: wine_guesses changes aren't
  // realtime-broadcast at all, and the `wines` table (which the realtime
  // effect above does listen to) never changes during a seen tasting's
  // collecting stage, since registration is already locked by then.
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
        if (!cancelled) setSeenProgress(data.seenProgress);
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

      // Same "collecting" transition point for seen mode's progress card — no
      // refetch needed here, unlike course_reveal above, since a
      // just-started tasting's progress is trivially "0 of everything" and
      // computable locally from state already on hand.
      if (tastingMode === "seen") {
        setSeenProgress({
          ratersCount: 0,
          totalParticipants: guests.length,
          ratingsSubmitted: 0,
          totalPossibleRatings: wines.length * guests.length,
        });
      }
    } catch {
      setActionError(friendlyRpcError(null));
      setStarting(false);
    }
  }

  async function handleReveal() {
    setRevealing(true);
    setActionError(null);
    try {
      const response = await fetch("/api/host/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, hostToken }),
      });
      const data = await response.json();
      if (!response.ok) {
        setActionError(data.error ?? "Couldn't reveal results.");
        setRevealing(false);
        return;
      }
      setStatus("revealed");
      setShowRevealConfirm(false);
      setRevealing(false);
    } catch {
      setActionError(friendlyRpcError(null));
      setRevealing(false);
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
      <HomeLink />

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
                  </li>
                ))}
              </ol>
            </Card>
            <p className="text-xs text-cellar-muted">
              Registration is closed and bottle numbers are final.
            </p>
          </div>

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
              <Card className="text-sm text-cellar-muted">
                All bottles remain hidden until the final reveal.
              </Card>
              <div className="flex flex-col gap-3 border-t border-cellar-border pt-5">
                <SectionEyebrow>Host actions</SectionEyebrow>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Link href={`/tasting/${publicId}`}>
                    <Button variant="secondary" fullWidth>
                      Enter my guesses
                    </Button>
                  </Link>
                  <Button fullWidth onClick={() => setShowRevealConfirm(true)}>
                    Reveal results
                  </Button>
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
                </div>
              </div>
            </>
          )}

          {tastingMode === "seen" && (
            <>
              <Card className="flex flex-col gap-2">
                <p className="text-sm text-cellar-muted">
                  All bottles are visible. Guests can revise their ratings
                  until you end the tasting.
                </p>
                {seenProgress && (
                  <div className="grid grid-cols-2 gap-3 rounded-sm bg-cellar-bg p-3 text-center">
                    <Stat
                      label="Participants rated ≥1 bottle"
                      value={`${seenProgress.ratersCount} of ${seenProgress.totalParticipants}`}
                    />
                    <Stat
                      label="Ratings submitted"
                      value={`${seenProgress.ratingsSubmitted} of ${seenProgress.totalPossibleRatings}`}
                    />
                  </div>
                )}
              </Card>
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

      {showRevealConfirm && (
        <Modal
          title="Reveal all wines and scores?"
          onClose={() => !revealing && setShowRevealConfirm(false)}
        >
          <p>
            Guests will immediately be able to see the answer key and
            results. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowRevealConfirm(false)}
              disabled={revealing}
            >
              Cancel
            </Button>
            <Button onClick={handleReveal} disabled={revealing}>
              {revealing ? "Revealing…" : "Reveal"}
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
