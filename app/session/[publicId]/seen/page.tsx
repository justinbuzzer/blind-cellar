"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { SeenBottleCard } from "@/components/seen/SeenBottleCard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSeenTastingState } from "@/lib/supabase/guestActions";
import { SeenBottleDTO } from "@/lib/supabase/types";
import { getGuestToken } from "@/lib/deviceStorage";

type LoadState = "loading" | "no-config" | "invalid-token" | "ready";

// Manual-refresh fallback poll — wine_guesses (where ratings live) is
// deliberately never realtime-broadcast (see README "Tasting modes": a
// permissive policy there would leak every participant's ratings, not just
// a count), so this page can't learn about a rating saved from this same
// guest's other tab/device except by polling its own scoped RPC response.
const SEEN_LIST_POLL_MS = 8000;

/**
 * Bottle list for a seen-tasting session (see README "Tasting modes") — every
 * bottle is visible in full the moment the host starts tasting, and a
 * participant can rate any of them in any order, revisiting and changing a
 * rating freely until the host ends the tasting. Unlike full_blind/
 * course_reveal, there is no Previous/Next pacing here at all.
 */
export default function SeenTastingListPage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [guestName, setGuestName] = useState("");
  const [tastingTitle, setTastingTitle] = useState("");
  const [tastingDate, setTastingDate] = useState("");
  const [bottles, setBottles] = useState<SeenBottleDTO[]>([]);

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

    const { data, error } = await getSeenTastingState(supabase, token);
    if (error || !data) {
      setLoadState("invalid-token");
      return;
    }
    if (data.session.status === "revealed") {
      router.replace(`/results/${params.publicId}`);
      return;
    }
    // Defensive — this route is seen-only, same pattern as the
    // course_reveal active-bottle page's own mode check.
    if (data.session.tastingMode !== "seen") {
      router.replace(`/tasting/${params.publicId}`);
      return;
    }

    setGuestName(data.guestName);
    setTastingTitle(data.session.title);
    setTastingDate(data.session.tastingDate);
    setBottles(data.bottles);
    setLoadState("ready");
  }, [params.publicId, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime signal only (never read payload content) so this page notices
  // promptly when the host ends the tasting; the poll below is the fallback
  // if realtime never connects, and is also what picks up this guest's own
  // rating changes made from another tab/device (see SEEN_LIST_POLL_MS).
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`seen-list-${params.publicId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasting_sessions",
          filter: `public_id=eq.${params.publicId}`,
        },
        () => refresh()
      )
      .subscribe();

    const pollId = setInterval(refresh, SEEN_LIST_POLL_MS);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [params.publicId, refresh]);

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

  const ratedCount = bottles.filter((b) => b.myRating !== null).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <HostControlsLink sessionPublicId={params.publicId} />
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">{tastingTitle}</h1>
        {tastingDate && (
          <p className="mt-1 text-sm text-cellar-text/70">
            {new Date(tastingDate).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}
        <p className="mt-2 text-sm font-medium text-cellar-maroon">
          Seen tasting in progress
        </p>
        <p className="mt-1 text-sm text-cellar-text/70">
          All wines are visible. Rate each bottle at your own pace; you can
          revise your ratings until the host ends the tasting.
        </p>
      </div>

      <p className="text-sm text-cellar-text/60">
        Tasting as {guestName} · You have rated {ratedCount} of {bottles.length}{" "}
        bottles
      </p>

      <div className="flex flex-col gap-4">
        {bottles.map((bottle) => (
          <SeenBottleCard key={bottle.id} publicId={params.publicId} bottle={bottle} />
        ))}
      </div>
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
