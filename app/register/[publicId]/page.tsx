"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { StatusChip } from "@/components/StatusChip";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteBottle, getRegistrationState, markParticipantReady } from "@/lib/supabase/guestActions";
import { friendlyRpcError, MyBottleDTO, RegistrationStateResponse } from "@/lib/supabase/types";
import { formatOwnContributedBottle } from "@/lib/myBottleDisplay";
import { PARTICIPANT_READY_ANNOUNCEMENT } from "@/lib/readiness";
import { getGuestToken } from "@/lib/deviceStorage";

type LoadState = "loading" | "no-config" | "invalid-token" | "ready";

export default function RegistrationHomePage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [state, setState] = useState<RegistrationStateResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MyBottleDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [markingReady, setMarkingReady] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [readyAnnouncement, setReadyAnnouncement] = useState("");

  const refresh = useCallback(async () => {
    const token = getGuestToken(params.publicId);
    if (!token) {
      router.replace(`/join/${params.publicId}`);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }

    const { data, error } = await getRegistrationState(supabase, token);
    if (error || !data) {
      setLoadState("invalid-token");
      return;
    }

    if (data.session.status === "collecting") {
      router.replace(`/tasting/${params.publicId}`);
      return;
    }
    if (data.session.status === "revealed") {
      router.replace(`/results/${params.publicId}`);
      return;
    }

    setState(data);
    setLoadState("ready");
  }, [params.publicId, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`registration-${params.publicId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasting_sessions",
          filter: `public_id=eq.${params.publicId}`,
        },
        (payload) => {
          const next = payload.new as { status?: string };
          if (next.status === "collecting") {
            router.replace(`/tasting/${params.publicId}`);
          } else if (next.status === "revealed") {
            router.replace(`/results/${params.publicId}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [params.publicId, router]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const token = getGuestToken(params.publicId);
    const supabase = getSupabaseBrowserClient();
    if (!token || !supabase) return;

    setDeleting(true);
    setDeleteError(null);
    const { error } = await deleteBottle(supabase, token, deleteTarget.id);
    setDeleting(false);

    if (error) {
      setDeleteError(friendlyRpcError(error));
      return;
    }
    setDeleteTarget(null);
    await refresh();
  }

  async function handleMarkReady() {
    if (markingReady || state?.guest.readyToBeginAt) return;
    const token = getGuestToken(params.publicId);
    const supabase = getSupabaseBrowserClient();
    if (!token || !supabase) return;

    setMarkingReady(true);
    setReadyError(null);
    const { error } = await markParticipantReady(supabase, token);
    setMarkingReady(false);

    if (error) {
      setReadyError(friendlyRpcError(error));
      return;
    }
    setReadyAnnouncement(PARTICIPANT_READY_ANNOUNCEMENT);
    await refresh();
  }

  if (loadState === "loading") {
    return <LoadingState message="Preparing the table…" />;
  }

  if (loadState === "no-config") {
    return (
      <UnavailableScreen
        title="Supabase isn't configured"
        message="This deployment is missing its Supabase environment variables. See SUPABASE_SETUP.md."
      />
    );
  }

  if (loadState === "invalid-token") {
    return (
      <UnavailableScreen
        title="Your guest session isn't valid"
        message="We couldn't find your place in this tasting on this device. Try joining again."
        actionHref={`/join/${params.publicId}`}
        actionLabel="Join this tasting"
      />
    );
  }

  if (!state) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <HostControlsLink sessionPublicId={params.publicId} />
      </div>

      <PageHeader
        title="Your contribution"
        supporting="Register your bottle privately. Its identity remains hidden until the tasting reveals it."
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-cellar-muted">
        <span>{state.session.title}</span>
        <span aria-hidden="true">·</span>
        <StatusChip tone="active">Bottle registration open</StatusChip>
        <span aria-hidden="true">·</span>
        <span>Registering as {state.guest.displayName}</span>
      </div>

      <div className="flex flex-col gap-3">
        <SectionEyebrow>
          Your contributed bottles ({state.myBottles.length})
        </SectionEyebrow>
        {state.myBottles.length === 0 ? (
          <EmptyState
            title="No bottles yet"
            message="You haven't registered a bottle for this tasting yet."
          />
        ) : (
          <Card className="p-0">
            <ol className="divide-y divide-cellar-border">
              {state.myBottles.map((bottle) => {
                const display = formatOwnContributedBottle(bottle);
                return (
                  <li
                    key={bottle.id}
                    className="flex items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-display text-lg font-semibold text-cellar-maroon-dark">
                        {display.primaryLabel}
                      </p>
                      {display.originLine && (
                        <p className="mt-0.5 text-sm text-cellar-muted">{display.originLine}</p>
                      )}
                      {display.grapeLine && (
                        <p className="mt-0.5 text-sm text-cellar-muted">{display.grapeLine}</p>
                      )}
                      <p className="mt-1 text-xs text-cellar-muted">
                        {display.bottleNumberLabel} · {display.statusLabel}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link href={`/register/${params.publicId}/${bottle.id}`}>
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label={`Edit ${display.primaryLabel}`}
                        >
                          Edit
                        </Button>
                      </Link>
                      <Button
                        type="button"
                        variant="danger"
                        aria-label={`Delete ${display.primaryLabel}`}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(bottle);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </div>

      <Link href={`/register/${params.publicId}/new`}>
        <Button fullWidth>
          {state.myBottles.length === 0 ? "Register a bottle" : "Add another bottle"}
        </Button>
      </Link>

      <div className="flex flex-col gap-2 border-t border-cellar-border pt-5">
        <SectionEyebrow>Ready to begin?</SectionEyebrow>
        {state.guest.readyToBeginAt ? (
          <div>
            <p className="text-sm font-medium text-cellar-text">Ready to begin</p>
            <p className="mt-0.5 text-sm text-cellar-muted">
              You have confirmed that you are ready for the tasting.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-cellar-muted">
              Confirm when you have finished adding bottles, or if you are not contributing one.
            </p>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={markingReady}
              onClick={handleMarkReady}
              aria-label="Mark yourself ready to begin tasting"
            >
              {markingReady ? "Confirming…" : "I'm ready to begin"}
            </Button>
            {readyError && (
              <p role="alert" className="text-sm text-cellar-danger">
                {readyError}
              </p>
            )}
          </>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {readyAnnouncement}
        </p>
      </div>

      {deleteTarget && (
        <Modal
          title={`Remove ${formatOwnContributedBottle(deleteTarget).primaryLabel}?`}
          onClose={() => !deleting && setDeleteTarget(null)}
        >
          <p>This bottle number will not be reused.</p>
          {deleteError && (
            <p role="alert" className="mt-2 text-sm text-cellar-danger">
              {deleteError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Removing…" : "Remove bottle"}
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
