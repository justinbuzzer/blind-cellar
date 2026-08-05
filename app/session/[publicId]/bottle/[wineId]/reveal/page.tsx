"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Stat } from "@/components/Stat";
import { MatchBadge } from "@/components/MatchBadge";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { ImageBand } from "@/components/ImageBand";
import { bottleRevealImage } from "@/lib/appImages";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getRevealedBottle } from "@/lib/supabase/guestActions";
import { buildRevealedBottleResult } from "@/lib/supabase/mappers";
import { RevealedBottleWineDTO } from "@/lib/supabase/types";
import {
  BONUS_MAX_POINTS,
  CORE_MAX_POINTS,
  FieldScore,
  TOTAL_MAX_POINTS_PER_WINE,
  WINE_STYLE_LABELS,
  WineResult,
} from "@/types/tasting";
import { getGuestToken } from "@/lib/deviceStorage";

type LoadState = "loading" | "no-config" | "invalid-token" | "not-revealed-yet" | "ready";

const FIELD_LABELS: Record<string, string> = {
  country: "Country",
  region: "Region",
  grapeBlend: "Grape / blend",
  vintage: "Vintage",
  producer: "Producer",
  wineName: "Wine / cuvée",
};

/**
 * Per-bottle reveal screen for a course_reveal session — see README "Tasting
 * modes". Reuses `calculateWineResults`/`scoreWineGuess` exactly as the
 * final full-session report does (via `buildRevealedBottleResult`), just
 * scoped to this one bottle. Deliberately does not show a running
 * leaderboard/ranking — the spec calls a full one unnecessary complexity for
 * a mid-tasting screen.
 */
export default function BottleRevealPage() {
  const params = useParams<{ publicId: string; wineId: string }>();
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [result, setResult] = useState<WineResult | null>(null);
  const [wineInfo, setWineInfo] = useState<RevealedBottleWineDTO | null>(null);
  const [sessionRevealed, setSessionRevealed] = useState(false);

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
      setSessionRevealed(data.session.status === "revealed");
      setLoadState("ready");
    })();
  }, [params.publicId, params.wineId, router]);

  if (loadState === "loading") {
    return <LoadingState message="Preparing the reveal…" />;
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
        title="This reveal isn't available"
        message="We couldn't load this bottle's reveal. Try joining again."
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
        actionHref={`/session/${params.publicId}/active`}
        actionLabel="Back to active bottle"
      />
    );
  }

  if (!result || !wineInfo) return null;
  const { wine } = result;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <HostControlsLink sessionPublicId={params.publicId} />
      </div>

      <div className="border-b border-cellar-gold/40 pb-6 text-center sm:text-left">
        <SectionEyebrow>
          {wine.code} · Revealed
        </SectionEyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold text-cellar-maroon-dark sm:text-4xl">
          {wine.wineName || WINE_STYLE_LABELS[wine.wineStyle]}
        </h1>
        {wine.vintage && <p className="mt-1 text-lg text-cellar-muted">{wine.vintage}</p>}
      </div>

      <ImageBand image={bottleRevealImage} className="hidden h-40 rounded-sm sm:block" />

      <Card className="flex flex-col gap-4">
        <SectionEyebrow>The answer key</SectionEyebrow>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <AnswerRow label="Country" value={wine.country} />
          <AnswerRow label="Region" value={wine.region} />
          <AnswerRow label="Grape / blend" value={wine.grapeBlend} />
          <AnswerRow label="Vintage" value={wine.vintage} />
          <AnswerRow label="Producer" value={wine.producer} />
          <AnswerRow label="Wine / cuvée" value={wine.wineName} />
          <AnswerRow label="Style" value={WINE_STYLE_LABELS[wine.wineStyle]} />
          <AnswerRow label="Contributed by" value={wine.contributorName} />
        </dl>
        <p className="border-t border-cellar-border pt-3 text-xs text-cellar-muted">
          Bottle {wineInfo.position} of {wineInfo.totalBottles}
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionEyebrow>Group ratings</SectionEyebrow>
        <div className="grid grid-cols-2 gap-3 rounded-sm bg-cellar-bg-deep p-3 text-center sm:grid-cols-4">
          <Stat label="Average" value={result.averageRating ?? "—"} />
          <Stat label="Ratings" value={result.numRatings} />
          <Stat label="Lowest" value={result.lowestRating ?? "—"} />
          <Stat label="Highest" value={result.highestRating ?? "—"} />
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionEyebrow>Everyone&rsquo;s guesses</SectionEyebrow>
        {result.guesses.length === 0 ? (
          <Card className="text-sm text-cellar-muted">
            No one submitted a guess for this bottle in time.
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {result.guesses.map((guess) => {
              const coreFields = guess.fieldScores.filter((f) => f.category === "core");
              const bonusFields = guess.fieldScores.filter((f) => f.category === "bonus");
              return (
                <details key={guess.guestId} className="rounded-sm border border-cellar-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
                    <span>{guess.guestName}</span>
                    <span className="text-cellar-muted">
                      {guess.totalPoints}/{TOTAL_MAX_POINTS_PER_WINE} pts
                      {guess.rating !== null ? ` · rated ${guess.rating}` : ""}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-4 border-t border-cellar-border px-3 py-3">
                    <FieldScoreTable heading="Core categories" fields={coreFields} />
                    <FieldScoreTable heading="Bonus categories" fields={bonusFields} />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-sm bg-cellar-bg-deep px-3 py-2 text-sm font-medium text-cellar-text">
                      <span>
                        Core: {guess.corePoints}/{CORE_MAX_POINTS}
                      </span>
                      <span>
                        Bonus: {guess.bonusPoints}/{BONUS_MAX_POINTS}
                      </span>
                      <span className="text-cellar-maroon">
                        Total: {guess.totalPoints}/{TOTAL_MAX_POINTS_PER_WINE}
                      </span>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {sessionRevealed ? (
        <Link href={`/results/${params.publicId}`}>
          <Button fullWidth>View final results</Button>
        </Link>
      ) : (
        <Link href={`/session/${params.publicId}/active`}>
          <Button fullWidth>Continue to next bottle</Button>
        </Link>
      )}
    </main>
  );
}

function AnswerRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-cellar-text">{value}</dd>
    </div>
  );
}

function FieldScoreTable({ heading, fields }: { heading: string; fields: FieldScore[] }) {
  if (fields.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-cellar-muted">
        {heading}
      </p>
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 text-xs font-semibold uppercase tracking-wide text-cellar-muted">
        <span>Field</span>
        <span>Guess</span>
        <span>Actual</span>
        <span />
      </div>
      {fields.map((fieldScore) => (
        <div
          key={fieldScore.field}
          className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 text-sm"
        >
          <span className="text-cellar-muted">{FIELD_LABELS[fieldScore.field]}</span>
          <span className="truncate text-cellar-text">{fieldScore.guessedValue}</span>
          <span className="truncate text-cellar-muted">{fieldScore.answerValue}</span>
          <MatchBadge correct={fieldScore.correct} />
        </div>
      ))}
    </div>
  );
}
