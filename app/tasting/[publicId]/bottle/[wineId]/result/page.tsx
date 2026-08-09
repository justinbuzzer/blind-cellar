"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Stat } from "@/components/Stat";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { RevealedWineIdentity } from "@/components/report/RevealedWineIdentity";
import { ParticipantScoreBreakdown } from "@/components/report/ParticipantScoreBreakdown";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getRevealedBottle } from "@/lib/supabase/guestActions";
import { buildRevealedBottleResult } from "@/lib/supabase/mappers";
import { bottleLabel } from "@/lib/codes";
import { getGuestToken } from "@/lib/deviceStorage";
import { RevealedBottleWineDTO } from "@/lib/supabase/types";
import { WineResult } from "@/types/tasting";

type LoadState = "loading" | "no-config" | "invalid-token" | "not-revealed-yet" | "ready";

/**
 * Participant per-bottle result page for full_blind — see README "Results
 * reveal". Mirrors the existing course_reveal per-bottle reveal screen
 * (app/session/[publicId]/bottle/[wineId]/reveal/page.tsx), reusing the same
 * get_revealed_bottle RPC and buildRevealedBottleResult mapper, but shows
 * only the caller's own score breakdown (get_revealed_bottle now returns
 * only the caller's own guess — see supabase/schema.sql).
 */
export default function FullBlindBottleResultPage() {
  const params = useParams<{ publicId: string; wineId: string }>();
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [result, setResult] = useState<WineResult | null>(null);
  const [wineInfo, setWineInfo] = useState<RevealedBottleWineDTO | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [allRevealed, setAllRevealed] = useState(false);

  useEffect(() => {
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

    (async () => {
      const { data, error } = await getRevealedBottle(supabase, token, params.wineId);
      if (error?.message?.includes("bottle_not_revealed")) {
        setLoadState("not-revealed-yet");
        return;
      }
      if (error || !data) {
        setLoadState("invalid-token");
        return;
      }
      setResult(buildRevealedBottleResult(data));
      setWineInfo(data.wine);
      setSubmitted(data.submitted);
      setAllRevealed(data.session.status === "revealed");
      setLoadState("ready");
    })();
  }, [params.publicId, params.wineId, router]);

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

  if (loadState === "invalid-token") {
    return (
      <UnavailableScreen
        title="This result isn't available"
        message="We couldn't load this bottle's results. Try joining again."
        actionHref={`/join/${params.publicId}`}
        actionLabel="Join this tasting"
      />
    );
  }

  if (loadState === "not-revealed-yet") {
    return (
      <UnavailableScreen
        title="Not revealed yet"
        message="This bottle hasn't been revealed by the host yet."
        actionHref={`/tasting/${params.publicId}/results`}
        actionLabel="Back to results"
      />
    );
  }

  if (!result || !wineInfo) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <HostControlsLink sessionPublicId={params.publicId} />
      </div>

      <div className="border-b border-cellar-gold/40 pb-6">
        <SectionEyebrow>{bottleLabel(wineInfo.bottleNumber)} · Results</SectionEyebrow>
        <div className="mt-2">
          <RevealedWineIdentity wine={result.wine} />
        </div>
        <p className="mt-2 text-xs text-cellar-muted">
          Bottle {wineInfo.position} of {wineInfo.totalBottles}
        </p>
      </div>

      <Card className="flex flex-col gap-3">
        <SectionEyebrow>Group ratings</SectionEyebrow>
        <div className="grid grid-cols-2 gap-3 rounded-sm bg-cellar-bg-deep p-3 text-center sm:grid-cols-4">
          <Stat label="Average" value={result.averageRating ?? "—"} />
          <Stat label="Ratings" value={result.numRatings} />
          <Stat label="Lowest" value={result.lowestRating ?? "—"} />
          <Stat label="Highest" value={result.highestRating ?? "—"} />
        </div>
      </Card>

      <section className="flex flex-col gap-2">
        <SectionEyebrow>Your score</SectionEyebrow>
        <ParticipantScoreBreakdown wine={result.wine} score={submitted ? result.guesses[0] ?? null : null} />
      </section>

      <Link href={allRevealed ? `/results/${params.publicId}` : `/tasting/${params.publicId}/results`}>
        <Button fullWidth>{allRevealed ? "View final leaderboard" : "Back to results"}</Button>
      </Link>
    </main>
  );
}
