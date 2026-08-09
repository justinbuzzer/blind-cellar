"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { ResultsHubList } from "@/components/ResultsHubList";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getRevealedBottlesSummary } from "@/lib/supabase/guestActions";
import { getGuestToken } from "@/lib/deviceStorage";
import { RevealedBottlesSummaryResponse } from "@/lib/supabase/types";

type LoadState = "loading" | "no-config" | "invalid-token" | "ready";

/**
 * Participant results hub for full_blind — see README "Results reveal".
 * Lists every bottle's safe label + reveal state, and links to the final
 * leaderboard (the existing /results/[publicId] page) once every bottle has
 * been revealed. Live updates use the same realtime-signal-plus-poll
 * fallback convention as app/tasting/[publicId]/page.tsx.
 */
export default function FullBlindResultsHubPage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<RevealedBottlesSummaryResponse | null>(null);
  const guestTokenRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const token = guestTokenRef.current;
    if (!supabase || !token) return;
    const { data, error } = await getRevealedBottlesSummary(supabase, token);
    if (error || !data) {
      setLoadState("invalid-token");
      return;
    }
    setSummary(data);
    setLoadState("ready");
  }, []);

  useEffect(() => {
    const token = getGuestToken(params.publicId);
    if (!token) {
      router.replace(`/join/${params.publicId}`);
      return;
    }
    guestTokenRef.current = token;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }

    refresh();
  }, [params.publicId, router, refresh]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`results-hub-${params.publicId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wines" }, () => refresh())
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

    const pollId = setInterval(refresh, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [params.publicId, refresh]);

  if (loadState === "loading") {
    return <LoadingState message="Loading results…" />;
  }

  if (loadState === "no-config") {
    return (
      <UnavailableScreen
        title="Supabase isn't configured"
        message="This deployment is missing its Supabase environment variables. See SUPABASE_SETUP.md."
      />
    );
  }

  if (loadState === "invalid-token" || !summary) {
    return (
      <UnavailableScreen
        title="Your guest session isn't valid"
        message="We couldn't find your place in this tasting on this device. Try joining again."
        actionHref={`/join/${params.publicId}`}
        actionLabel="Join this tasting"
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <HostControlsLink sessionPublicId={params.publicId} />
      </div>
      <div>
        <SectionEyebrow>Results</SectionEyebrow>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-cellar-maroon-dark">
          Bottle results
        </h1>
      </div>
      <ResultsHubList
        bottles={summary.bottles}
        allRevealed={summary.allRevealed}
        resultHref={(wineId) => `/tasting/${params.publicId}/bottle/${wineId}/result`}
        finalResultsHref={`/results/${params.publicId}`}
      />
    </main>
  );
}
