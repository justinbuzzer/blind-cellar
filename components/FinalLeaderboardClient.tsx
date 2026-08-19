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
import { CreditsLeaderboard } from "@/components/report/CreditsLeaderboard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getFinalLeaderboard } from "@/lib/supabase/guestActions";
import {
  buildFinalLeaderboardView,
  FinalLeaderboardView,
  formatLeaderboardPercent,
  withYouSuffix,
} from "@/lib/resultsReveal";
import { buildCreditLedger, CreditLedgerEntry } from "@/lib/betting";
import { getGuestToken } from "@/lib/deviceStorage";

type LoadState = "loading" | "no-config" | "invalid-token" | "unavailable" | "waiting" | "ready";

interface FinalLeaderboardClientProps {
  publicId: string;
  /** Where "Back to results" points — the mode-appropriate participant results hub. */
  hubHref: string;
  /** Where "View tasting recap" points — the mode-appropriate recap page. */
  recapHref: string;
}

/**
 * Participant-facing final leaderboard — see README "Final leaderboard and
 * tasting recap". Shared by full_blind (/tasting/[publicId]/leaderboard) and
 * course_reveal (/session/[publicId]/leaderboard), which differ only in
 * their nav hrefs. Only ever fetches data via get_final_leaderboard_for_guest,
 * which itself only ever returns rows once the whole session has reached
 * 'revealed' — this component never computes or guesses eligibility, it only
 * reacts to what the server returned.
 */
export function FinalLeaderboardClient({ publicId, hubHref, recapHref }: FinalLeaderboardClientProps) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [view, setView] = useState<FinalLeaderboardView | null>(null);
  // Betting sub-mode only (see README "Tasting modes" — "Betting") — null
  // for a non-betting session.
  const [creditEntries, setCreditEntries] = useState<CreditLedgerEntry[] | null>(null);
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
    setCreditEntries(data.bettingEnabled ? buildCreditLedger(data).entries : null);
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

  // Realtime signal only — never read payload content, always refetch
  // through the secure RPC. Falls back to a short poll if the realtime
  // channel never connects, matching this app's existing waiting-for-reveal
  // pages (see app/results/[publicId]/page.tsx).
  useEffect(() => {
    if (loadState !== "waiting") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`final-leaderboard-${publicId}`)
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
    return <LoadingState message="Loading the final leaderboard…" />;
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
        title="No final leaderboard for this tasting"
        message="Seen tastings don't have a blind score or final leaderboard."
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
            The final leaderboard will be available after all results are revealed.
          </p>
        </div>
        <Link href={hubHref}>
          <Button variant="secondary">Back to results</Button>
        </Link>
      </main>
    );
  }

  if (!view) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <HostControlsLink sessionPublicId={publicId} />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div>
        <SectionEyebrow>{view.title}</SectionEyebrow>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-cellar-maroon-dark">
          Final leaderboard
        </h1>
        <p className="mt-2 text-sm text-cellar-muted">Scores across all revealed bottles</p>
      </div>

      {view.tasterResults.length === 0 ? (
        <Card className="text-sm text-cellar-muted">No guests submitted entries for this tasting.</Card>
      ) : (
        <ol className="flex flex-col divide-y divide-cellar-border rounded-sm border border-cellar-border bg-white">
          {view.tasterResults.map((taster) => {
            const isYou = taster.guestId === view.myGuestId;
            return (
              <li
                key={taster.guestId}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  isYou ? "bg-cellar-gold/10" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="sr-only">Rank</span>
                  <span aria-hidden="true" className="w-6 shrink-0 text-right font-display text-lg text-cellar-muted">
                    {taster.rank}
                  </span>
                  <span className="truncate text-sm font-medium text-cellar-text">
                    {withYouSuffix(taster.guestName, isYou)}
                  </span>
                </span>
                <span className="shrink-0 font-display text-lg font-semibold text-cellar-maroon-dark">
                  {formatLeaderboardPercent(taster.overallAccuracyPercent)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {creditEntries && (
        <section className="flex flex-col gap-2">
          <SectionEyebrow>Credits leaderboard</SectionEyebrow>
          <CreditsLeaderboard entries={creditEntries} myGuestId={view.myGuestId} />
        </section>
      )}

      <Link href={recapHref}>
        <Button fullWidth>View tasting recap</Button>
      </Link>
    </main>
  );
}
