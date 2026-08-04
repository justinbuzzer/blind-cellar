"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { QRCodeCard } from "@/components/QRCodeCard";
import { TastingOrderList } from "@/components/host/TastingOrderList";
import { HomeLink } from "@/components/navigation/HomeLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyRpcError, HostBottleDTO, HostGuestDTO, HostSessionResponse } from "@/lib/supabase/types";
import { SessionStatus } from "@/types/tasting";

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

export function HostControlClient({
  publicId,
  hostToken,
  initialData,
}: HostControlClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus>(initialData.session.status);
  const [guests, setGuests] = useState<HostGuestDTO[]>(initialData.guests);
  const [wines, setWines] = useState<HostBottleDTO[]>(initialData.wines);
  const [showRevealConfirm, setShowRevealConfirm] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(true);
  const [joinUrl, setJoinUrl] = useState("");

  const { session } = initialData;
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <HomeLink />
      <div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">
          {session.title}
        </h1>
        <p className="mt-1 text-sm text-cellar-text/70">
          {new Date(session.tastingDate).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {!realtimeOk && (
        <p className="flex items-center justify-between gap-2 rounded-lg border border-cellar-gold/40 bg-cellar-gold/10 px-3 py-2 text-sm text-cellar-text/80">
          Live updates aren&rsquo;t connected right now.
          <Button variant="ghost" onClick={() => router.refresh()}>
            Refresh
          </Button>
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Bottles" value={wines.length} />
          <Stat
            label="Submissions"
            value={status === "registration" ? "—" : `${completedCount} / ${guests.length}`}
          />
          <Stat label="Status" value={STATUS_LABELS[status]} />
        </div>
      </Card>

      {status !== "revealed" && (
        <Card>
          <QRCodeCard url={joinUrl} joinCode={session.joinCode} />
        </Card>
      )}

      {status === "registration" && (
        <>
          <Card className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-cellar-text">
              Registered bottles ({wines.length})
            </h2>
            {wines.length === 0 ? (
              <p className="text-sm text-cellar-text/60">
                No bottles registered yet. Everyone, including you, can
                register a bottle below.
              </p>
            ) : (
              <p className="text-sm text-cellar-text/70">
                {wines.map((w) => w.anonymousCode).join(", ")}
              </p>
            )}
          </Card>

          {wines.length > 0 && (
            <TastingOrderList
              publicId={publicId}
              hostToken={hostToken}
              wines={wines}
              onReordered={setWines}
            />
          )}

          <Card className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-cellar-text">
              Participants joined ({guests.length})
            </h2>
            {guests.length === 0 ? (
              <p className="text-sm text-cellar-text/60">
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
        </>
      )}

      {status === "collecting" && (
        <>
          <Card className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-cellar-text">
              Bottles ({wines.length})
            </h2>
            <p className="text-sm text-cellar-text/70">
              {wines.map((w) => w.anonymousCode).join(", ")} — registration is
              closed and bottle numbers are final.
            </p>
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-cellar-text">
              Participants ({guests.length})
            </h2>
            {guests.length === 0 ? (
              <p className="text-sm text-cellar-text/60">No one has joined yet.</p>
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
                    <span
                      className={
                        guest.completedAt
                          ? "font-medium text-cellar-maroon"
                          : "text-cellar-text/50"
                      }
                    >
                      {guest.completedAt ? "Submitted" : "In progress"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

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
        </>
      )}

      {status === "revealed" && (
        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-cellar-text/70">
            Results are revealed. Everyone can now see the answer key and the
            full report.
          </p>
          <Link href={`/results/${publicId}`}>
            <Button>View shared results</Button>
          </Link>
        </Card>
      )}

      {actionError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-lg font-semibold text-cellar-maroon-dark">{value}</p>
      <p className="text-xs text-cellar-text/60">{label}</p>
    </div>
  );
}
