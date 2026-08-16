"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { ProgressBar } from "@/components/ProgressBar";
import { WineGuessForm } from "@/components/WineGuessForm";
import { OwnerBottleView } from "@/components/OwnerBottleView";
import { GuessGroupProgress } from "@/components/GuessGroupProgress";
import { SavingIndicator, SaveState } from "@/components/SavingIndicator";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { ImageBand } from "@/components/ImageBand";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { ResultsLink } from "@/components/navigation/ResultsLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getActiveBottleState,
  getHostGuessProgress,
  lockWineGuess,
  upsertGuess,
} from "@/lib/supabase/guestActions";
import { friendlyRpcError, ActiveBottleDTO, HostGuessProgressDTO } from "@/lib/supabase/types";
import { mapGuestGuessDtoToWineGuess } from "@/lib/supabase/mappers";
import { emptyWineGuess } from "@/lib/guess";
import { BLEND_MIN_GRAPES_MESSAGE, hasIncompleteBlend, invalidOtherGrapeGuessMessage } from "@/lib/validation";
import { getGuestToken, getHostToken } from "@/lib/deviceStorage";
import { waitingToRevealImage } from "@/lib/appImages";
import { buildBottleDisplayLabels, formatBottleAccessibleLabel, formatContributorBottleLabel } from "@/lib/contributorLabel";
import { WineGuess } from "@/types/tasting";

type LoadState =
  | "loading"
  | "no-config"
  | "invalid-token"
  | "waiting-for-next"
  | "locked"
  | "revealed-waiting"
  | "ready";

/**
 * Participant guess-entry for a course_reveal session's current active
 * bottle only — see README "Tasting modes". Unlike the full_blind flow
 * (`/tasting/[publicId]`), there is no Previous/Next between bottles: this
 * route always shows *the* active bottle, and the only way to see the next
 * one is to finish this one, wait for the host's reveal, and choose
 * "Continue" from the per-bottle reveal screen.
 */
export default function ActiveBottlePage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [guestName, setGuestName] = useState("");
  const [activeBottle, setActiveBottle] = useState<ActiveBottleDTO | null>(null);
  const [guess, setGuess] = useState<WineGuess | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [blendError, setBlendError] = useState<string | null>(null);
  const [otherGrapeError, setOtherGrapeError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lockError, setLockError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [revealedBottle, setRevealedBottle] = useState<{
    id: string;
    anonymousCode: string;
  } | null>(null);
  const [hostGuessProgress, setHostGuessProgress] = useState<HostGuessProgressDTO | null>(null);

  const guestTokenRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ wineId: string; guess: WineGuess } | null>(null);
  // The bottle we're currently locked on (or actively guessing), so that
  // when a refresh shows a *different* active bottle we know ours was just
  // revealed — the server no longer reports a revealed bottle as "active".
  const trackedBottleRef = useRef<ActiveBottleDTO | null>(null);
  // Set once, synchronously, before the first refresh() call — see README
  // "Host per-bottle response progress" — "Host guess screen group
  // progress". A UI-only decision (same local host-token check as
  // HostControlsLink); get_host_guess_progress independently re-verifies
  // this guest token actually belongs to the session's host.
  const isHostRef = useRef(false);
  // Guards against a stale in-flight progress fetch for a previous active
  // bottle overwriting the count for whichever bottle is now active.
  const latestActiveBottleIdRef = useRef<string | null>(null);

  const performSave = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const token = guestTokenRef.current;
    const pending = pendingSaveRef.current;
    if (!supabase || !token || !pending) return;
    pendingSaveRef.current = null;

    const { error } = await upsertGuess(supabase, token, pending.wineId, pending.guess);
    setSaveState(error ? "error" : "saved");
  }, []);

  const flushSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    await performSave();
  }, [performSave]);

  const scheduleSave = useCallback(
    (wineId: string, next: WineGuess) => {
      pendingSaveRef.current = { wineId, guess: next };
      setSaveState("saving");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        performSave();
      }, 600);
    },
    [performSave]
  );

  const refresh = useCallback(async () => {
    const token = guestTokenRef.current;
    const supabase = getSupabaseBrowserClient();
    if (!token || !supabase) return;

    const { data, error } = await getActiveBottleState(supabase, token);
    if (error || !data) {
      setLoadState("invalid-token");
      return;
    }
    if (data.session.status === "revealed") {
      router.replace(`/results/${params.publicId}`);
      return;
    }
    if (data.session.tastingMode !== "course_reveal") {
      router.replace(`/tasting/${params.publicId}`);
      return;
    }

    setGuestName(data.guestName);

    if (!data.activeBottle) {
      // No bottle is currently active — either the host hasn't released one
      // yet (a genuine, possibly extended wait — see README "Course-by-
      // course host-selected release"), or the last bottle was just revealed
      // and this device hasn't seen the session flip to 'revealed' yet. This
      // page never predicts or fetches which bottle might come next.
      setLoadState("waiting-for-next");
      return;
    }

    const wasTrackingDifferentBottle =
      trackedBottleRef.current !== null &&
      trackedBottleRef.current.id !== data.activeBottle.id;

    if (wasTrackingDifferentBottle && trackedBottleRef.current) {
      setRevealedBottle({
        id: trackedBottleRef.current.id,
        anonymousCode: trackedBottleRef.current.anonymousCode,
      });
      setLoadState("revealed-waiting");
      return;
    }

    trackedBottleRef.current = data.activeBottle;
    setActiveBottle(data.activeBottle);
    setGuess(
      data.myGuess ? mapGuestGuessDtoToWineGuess(data.myGuess) : emptyWineGuess(data.activeBottle.id)
    );
    setLoadState(data.locked ? "locked" : "ready");

    if (isHostRef.current) {
      const wineId = data.activeBottle.id;
      if (latestActiveBottleIdRef.current !== wineId) {
        // Switched to a different active bottle — clear immediately so the
        // previous bottle's count is never briefly shown for the new one.
        setHostGuessProgress(null);
      }
      latestActiveBottleIdRef.current = wineId;
      if (token) {
        getHostGuessProgress(supabase, token, wineId).then(({ data: progress }) => {
          if (latestActiveBottleIdRef.current === wineId) {
            setHostGuessProgress(progress);
          }
        });
      }
    }
  }, [params.publicId, router]);

  useEffect(() => {
    const token = getGuestToken(params.publicId);
    if (!token) {
      router.replace(`/join/${params.publicId}`);
      return;
    }
    guestTokenRef.current = token;
    isHostRef.current = !!getHostToken(params.publicId);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }

    refresh();
  }, [params.publicId, router, refresh]);

  // Realtime signal only — never read payload content, always refetch
  // through the secure RPC. Falls back to a short poll if the realtime
  // channel never connects, since this page needs to notice a reveal
  // without the participant taking any action.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`active-bottle-${params.publicId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wines" },
        () => refresh()
      )
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

  function updateGuess(next: WineGuess) {
    setGuess(next);
    scheduleSave(next.wineId, next);
    setRatingError(null);
    setBlendError(null);
    setOtherGrapeError(null);
  }

  async function handleLockGuess() {
    if (!guess || !activeBottle || activeBottle.isOwnBottle) return;
    if (guess.rating === null) {
      setRatingError("A rating is required.");
      return;
    }
    if (hasIncompleteBlend(guess)) {
      setBlendError(BLEND_MIN_GRAPES_MESSAGE);
      return;
    }
    const otherGrapeMessage = invalidOtherGrapeGuessMessage(guess);
    if (otherGrapeMessage) {
      setOtherGrapeError(otherGrapeMessage);
      return;
    }

    setLockError(null);
    setLocking(true);
    await flushSave();

    const supabase = getSupabaseBrowserClient();
    const token = guestTokenRef.current;
    if (!supabase || !token) {
      setLockError("Supabase isn't configured for this app yet.");
      setLocking(false);
      return;
    }

    const { error } = await lockWineGuess(supabase, token, activeBottle.id);
    setLocking(false);
    if (error) {
      setLockError(friendlyRpcError(error));
      return;
    }
    trackedBottleRef.current = activeBottle;
    setLoadState("locked");
  }

  if (loadState === "loading") {
    return <LoadingState message="Gathering the evening's notes…" />;
  }

  if (loadState === "waiting-for-next") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-6">
        <div className="flex items-center gap-2">
          <HomeLink />
          <HostControlsLink sessionPublicId={params.publicId} />
          <ResultsLink href={`/session/${params.publicId}/results`} />
        </div>
        <div className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-sm px-6 py-16 text-center">
          <ImageBand image={waitingToRevealImage} className="absolute inset-0" />
          <div className="relative flex flex-col items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-cellar-bg">
              Waiting for the host
            </h1>
            <p className="text-sm text-cellar-bg/80">
              The host hasn&rsquo;t released the next bottle yet. This page
              will update automatically.
            </p>
          </div>
        </div>
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

  if (loadState === "revealed-waiting" && revealedBottle) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-6">
        <div className="flex items-center gap-2">
          <HomeLink />
          <HostControlsLink sessionPublicId={params.publicId} />
          <ResultsLink href={`/session/${params.publicId}/results`} />
        </div>
        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-sm px-6 py-16 text-center">
          <ImageBand image={waitingToRevealImage} className="absolute inset-0" />
          <div className="relative flex flex-col items-center gap-4">
            <h1 className="font-display text-2xl font-semibold text-cellar-bg">
              {revealedBottle.anonymousCode} revealed!
            </h1>
            <p className="text-sm text-cellar-bg/80">
              The host has revealed this bottle. Take a look before moving on.
            </p>
            <Link href={`/session/${params.publicId}/bottle/${revealedBottle.id}/reveal`}>
              <Button>View reveal</Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (loadState === "locked") {
    const lockedContributorLabel = activeBottle
      ? formatContributorBottleLabel({
          contributorDisplayName: activeBottle.contributorName,
          styleBucket: activeBottle.contributorStyleBucket,
          contributorStyleSequence: activeBottle.contributorStyleSequence,
        })
      : null;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-6">
        <div className="flex items-center gap-2">
          <HomeLink />
          <HostControlsLink sessionPublicId={params.publicId} />
          <ResultsLink href={`/session/${params.publicId}/results`} />
        </div>
        <div className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-sm px-6 py-16 text-center">
          <ImageBand image={waitingToRevealImage} className="absolute inset-0" />
          <div className="relative flex flex-col items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cellar-gold">
              {activeBottle ? `Bottle ${activeBottle.bottleNumber}` : "Your bottle"}
            </p>
            {lockedContributorLabel && (
              <p className="text-xs text-cellar-bg/70">{lockedContributorLabel}</p>
            )}
            <h1 className="font-display text-2xl font-semibold text-cellar-bg">
              Your guess is locked
            </h1>
            <p className="text-sm text-cellar-bg/80">
              The table is waiting for the next reveal. This page will update
              automatically.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!activeBottle || !guess) return null;

  const activeContributorLabelInput = {
    contributorDisplayName: activeBottle.contributorName,
    styleBucket: activeBottle.contributorStyleBucket,
    contributorStyleSequence: activeBottle.contributorStyleSequence,
  };
  const activeBottleLabels = buildBottleDisplayLabels(activeBottle.bottleNumber, activeContributorLabelInput);
  const activeBottleAccessibleLabel = formatBottleAccessibleLabel(
    activeBottle.bottleNumber,
    activeContributorLabelInput
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink confirmBeforeLeave hasUnsavedChanges={saveState === "saving"} />
        <HostControlsLink
          sessionPublicId={params.publicId}
          confirmBeforeLeave
          hasUnsavedChanges={saveState === "saving"}
        />
        <ResultsLink href={`/session/${params.publicId}/results`} />
      </div>
      <div>
        <SectionEyebrow>Blind tasting</SectionEyebrow>
        <p className="mt-1 text-sm text-cellar-muted">Tasting as {guestName}</p>
      </div>

      <ProgressBar
        current={activeBottle.position}
        total={activeBottle.totalBottles}
        label={`${activeBottleLabels.tastingOrderLabel} — ${activeBottle.position} of ${activeBottle.totalBottles}`}
      />

      {activeBottle.isOwnBottle ? (
        <OwnerBottleView bottleLabels={activeBottleLabels} bottleAccessibleLabel={activeBottleAccessibleLabel} />
      ) : (
        <>
          <GuessGroupProgress progress={hostGuessProgress} />

          <WineGuessForm
            key={activeBottle.id}
            bottleLabels={activeBottleLabels}
            bottleAccessibleLabel={activeBottleAccessibleLabel}
            value={guess}
            onChange={updateGuess}
            styleHint={activeBottle.styleHint}
            ratingError={ratingError ?? undefined}
            blendError={blendError ?? otherGrapeError ?? undefined}
          />

          <SavingIndicator state={saveState} />

          {lockError && (
            <p role="alert" className="rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger">
              {lockError}
            </p>
          )}

          <Button type="button" fullWidth onClick={handleLockGuess} disabled={locking}>
            {locking ? "Locking in…" : "Lock in my guess"}
          </Button>
        </>
      )}
    </main>
  );
}
