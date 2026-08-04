"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteBottle, getRegistrationState } from "@/lib/supabase/guestActions";
import { friendlyRpcError, MyBottleDTO, RegistrationStateResponse } from "@/lib/supabase/types";
import { bottleLabel } from "@/lib/codes";
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

  if (loadState === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6">
        <p className="text-sm text-cellar-text/60">Loading tasting…</p>
      </main>
    );
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
      <div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">
          {state.session.title}
        </h1>
        <p className="mt-1 text-sm text-cellar-text/70">
          {new Date(state.session.tastingDate).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <Card className="flex flex-col gap-1">
        <p className="text-sm font-medium text-cellar-maroon">
          Bottle registration open
        </p>
        <p className="text-sm text-cellar-text/70">
          Registering as {state.guest.displayName}
        </p>
        <p className="text-sm text-cellar-text/70">
          {state.bottleCount} {state.bottleCount === 1 ? "bottle" : "bottles"} registered
        </p>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-cellar-text">
          Your contributed bottles
        </h2>
        {state.myBottles.length === 0 ? (
          <Card className="text-sm text-cellar-text/60">
            You haven&rsquo;t registered a bottle yet.
          </Card>
        ) : (
          state.myBottles.map((bottle) => (
            <Card
              key={bottle.id}
              className="flex items-center justify-between gap-3"
            >
              <div>
                <p className="font-medium text-cellar-maroon-dark">
                  {bottleLabel(bottle.bottleNumber)}
                </p>
                <p className="text-xs text-cellar-text/60">Details saved</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/register/${params.publicId}/${bottle.id}`}>
                  <Button type="button" variant="secondary">
                    Edit
                  </Button>
                </Link>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(bottle);
                  }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Link href={`/register/${params.publicId}/new`}>
        <Button fullWidth>
          {state.myBottles.length === 0 ? "Add my bottle" : "Add another bottle"}
        </Button>
      </Link>

      {deleteTarget && (
        <Modal
          title={`Remove ${bottleLabel(deleteTarget.bottleNumber)}?`}
          onClose={() => !deleting && setDeleteTarget(null)}
        >
          <p>This bottle number will not be reused.</p>
          {deleteError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
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

function UnavailableScreen({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <HomeLink />
      <h1 className="text-xl font-semibold text-cellar-maroon-dark">{title}</h1>
      <p className="text-sm text-cellar-text/70">{message}</p>
      {actionHref && actionLabel && (
        <a href={actionHref}>
          <Button>{actionLabel}</Button>
        </a>
      )}
    </main>
  );
}
