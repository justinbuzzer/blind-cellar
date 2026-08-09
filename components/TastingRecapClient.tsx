"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { RevealedWineIdentity } from "@/components/report/RevealedWineIdentity";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getFinalLeaderboard } from "@/lib/supabase/guestActions";
import {
  buildFinalLeaderboardView,
  findGuessByGuestId,
  findMyTasterResult,
  formatLeaderboardPercent,
  FinalLeaderboardView,
} from "@/lib/resultsReveal";
import { getGuestToken } from "@/lib/deviceStorage";
import { TASTING_MODE_LABELS } from "@/types/tasting";

type LoadState = "loading" | "no-config" | "invalid-token" | "unavailable" | "waiting" | "ready";

interface TastingRecapClientProps {
  publicId: string;
  hubHref: string;
  leaderboardHref: string;
  bottleResultHref: (wineId: string) => string;
}

/**
 * Participant-facing tasting recap — see README "Final leaderboard and
 * tasting recap". Shared by full_blind (/tasting/[publicId]/recap) and
 * course_reveal (/session/[publicId]/recap). Only ever fetches data via
 * get_final_leaderboard_for_guest, mirroring FinalLeaderboardClient's exact
 * eligibility handling — this page never renders anything before the server
 * itself confirms every bottle has been revealed.
 */
export function TastingRecapClient({
  publicId,
  hubHref,
  leaderboardHref,
  bottleResultHref,
}: TastingRecapClientProps) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [view, setView] = useState<FinalLeaderboardView | null>(null);
  const guestTokenRef = useRef<string | null>(null);
  const hasAnnouncedRef = useRef(false);
  const [announcement, setAnnouncement] = useState("");

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const token = guestTokenRef.current;
    if (!supabase || !token) return;

    const { data, error } = await getFinalLeaderboard(supabase, token);
    if (error?.message?.includes("not_fully_revealed")) {
      setLoadState("waiting");
      return;
    }
    if (error?.message?.includes("invalid_tasting_mode")) {
      setLoadState("unavailable");
      return;
    }
    if (error || !data) {
      setLoadState("invalid-token");
      return;
    }
    setView(buildFinalLeaderboardView(data));
    if (!hasAnnouncedRef.current) {
      hasAnnouncedRef.current = true;
      setAnnouncement("Final leaderboard and tasting recap are now available.");
    }
    setLoadState("ready");
  }, []);

  useEffect(() => {
    const token = getGuestToken(publicId);
    if (!token) {
      router.replace(`/join/${publicId}`);
      return;
    }
    guestTokenRef.current = token;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }

    refresh();
  }, [publicId, router, refresh]);

  useEffect(() => {
    if (loadState !== "waiting") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`tasting-recap-${publicId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasting_sessions",
          filter: `public_id=eq.${publicId}`,
        },
        () => refresh()
      )
      .subscribe();

    const pollId = setInterval(refresh, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [loadState, publicId, refresh]);

  if (loadState === "loading") {
    return <LoadingState message="Preparing your tasting recap…" />;
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
        actionHref={`/join/${publicId}`}
        actionLabel="Join this tasting"
      />
    );
  }

  if (loadState === "unavailable") {
    return (
      <UnavailableScreen
        title="No tasting recap for this tasting"
        message="Seen tastings don't have a blind score or tasting recap."
        actionHref={hubHref}
        actionLabel="Back to results"
      />
    );
  }

  if (loadState === "waiting") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex items-center gap-2">
          <HomeLink />
          <HostControlsLink sessionPublicId={publicId} />
        </div>
        <div className="w-full border-t border-cellar-gold/40 pt-5">
          <h1 className="font-display text-2xl font-semibold text-cellar-maroon-dark">
            Not available yet
          </h1>
          <p className="mt-2 text-sm text-cellar-muted">
            The tasting recap will be available after all results are revealed.
          </p>
        </div>
        <Link href={hubHref}>
          <Button variant="secondary">Back to results</Button>
        </Link>
      </main>
    );
  }

  if (!view) return null;

  const mine = findMyTasterResult(view.tasterResults, view.myGuestId);
  const dateLabel = view.tastingDate
    ? new Date(view.tastingDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <HostControlsLink sessionPublicId={publicId} />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div>
        <SectionEyebrow>Tasting recap</SectionEyebrow>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-cellar-maroon-dark">
          {view.title}
        </h1>
        <p className="mt-2 text-sm text-cellar-muted">
          {[dateLabel, TASTING_MODE_LABELS[view.tastingMode]].filter(Boolean).join(" · ")}
          {" · "}
          {view.wineResults.length} bottle{view.wineResults.length === 1 ? "" : "s"} revealed
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-semibold text-cellar-maroon-dark">Your result</h2>
        {mine ? (
          <Card className="flex flex-col gap-3">
            <p className="text-sm text-cellar-muted">
              Rank {mine.rank} of {view.tasterResults.length}
            </p>
            <p className="font-display text-3xl font-semibold text-cellar-maroon-dark">
              {formatLeaderboardPercent(mine.overallAccuracyPercent)}
            </p>
            <p className="text-sm text-cellar-muted">
              {mine.totalPoints} / {mine.totalPossible} points
            </p>
          </Card>
        ) : (
          <Card className="text-sm text-cellar-muted">
            No eligible scored guesses were recorded.
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-cellar-maroon-dark">Revealed bottles</h2>
        {view.wineResults.length === 0 ? (
          <Card className="text-sm text-cellar-muted">No bottles were revealed in this tasting.</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {view.wineResults.map((wineResult) => {
              const myGuess = findGuessByGuestId(wineResult, view.myGuestId);
              return (
                <Card key={wineResult.wine.id} className="flex flex-col gap-3">
                  <div>
                    <SectionEyebrow>{wineResult.wine.code}</SectionEyebrow>
                    <div className="mt-1">
                      <RevealedWineIdentity wine={wineResult.wine} />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-cellar-text">
                    {myGuess
                      ? `Your score: ${myGuess.totalPoints} / ${myGuess.totalPossiblePoints}`
                      : "No submitted guess for this bottle."}
                  </p>
                  <Link
                    href={bottleResultHref(wineResult.wine.id)}
                    className="text-sm font-medium text-cellar-maroon underline-offset-4 hover:text-cellar-maroon-dark hover:underline"
                  >
                    View {wineResult.wine.code} results
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Link href={leaderboardHref}>
        <Button fullWidth>View final leaderboard</Button>
      </Link>
    </main>
  );
}
