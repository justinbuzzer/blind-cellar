"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { ProgressBar } from "@/components/ProgressBar";
import { WineGuessForm } from "@/components/WineGuessForm";
import { OwnerBottleView } from "@/components/OwnerBottleView";
import { GuessGroupProgress } from "@/components/GuessGroupProgress";
import { SavingIndicator, SaveState } from "@/components/SavingIndicator";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { ArchiveLink } from "@/components/navigation/ArchiveLink";
import { ResultsLink } from "@/components/navigation/ResultsLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  completeSubmission,
  getGuestSessionState,
  getHostGuessProgress,
  getRevealedBottlesSummary,
  upsertGuess,
} from "@/lib/supabase/guestActions";
import {
  friendlyRpcError,
  GuestSessionWineDTO,
  HostGuessProgressDTO,
  RevealedBottlesSummaryResponse,
} from "@/lib/supabase/types";
import { mapGuestGuessDtoToWineGuess } from "@/lib/supabase/mappers";
import { emptyWineGuess, winesRequiringGuess } from "@/lib/guess";
import { BLEND_MIN_GRAPES_MESSAGE, hasIncompleteBlend, invalidOtherGrapeGuessMessage } from "@/lib/validation";
import { getGuestToken, getHostToken } from "@/lib/deviceStorage";
import { buildBottleDisplayLabels, formatBottleAccessibleLabel } from "@/lib/contributorLabel";
import { WineGuess } from "@/types/tasting";

type LoadState =
  | "loading"
  | "no-config"
  | "invalid-token"
  | "locked"
  | "ready"
  | "submitted";

export default function GuestTastingPage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [guestName, setGuestName] = useState("");
  const [wines, setWines] = useState<GuestSessionWineDTO[]>([]);
  const [guesses, setGuesses] = useState<WineGuess[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ratingErrorWineId, setRatingErrorWineId] = useState<string | null>(null);
  const [blendErrorWineId, setBlendErrorWineId] = useState<string | null>(null);
  const [otherGrapeErrorWineId, setOtherGrapeErrorWineId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hostGuessProgress, setHostGuessProgress] = useState<HostGuessProgressDTO | null>(null);
  const [revealProgress, setRevealProgress] = useState<RevealedBottlesSummaryResponse | null>(null);

  const guestTokenRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ wineId: string; guess: WineGuess } | null>(null);
  // The currently-viewed wine's group-progress count is no longer identical
  // for every bottle (see README "Own-bottle guessing exclusion" — a
  // bottle's own contributor is excluded from its eligible/submitted count),
  // so this must always be re-fetched for whichever wine is currently shown,
  // never a fixed "any wine" stand-in.
  const latestWineIdRef = useRef<string | null>(null);

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
    (wineId: string, guess: WineGuess) => {
      pendingSaveRef.current = { wineId, guess };
      setSaveState("saving");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        performSave();
      }, 600);
    },
    [performSave]
  );

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

    (async () => {
      const { data, error } = await getGuestSessionState(supabase, token);
      if (error || !data) {
        setLoadState("invalid-token");
        return;
      }
      if (data.session.status === "revealed") {
        router.replace(`/results/${params.publicId}`);
        return;
      }
      // This route is full_blind-only — course_reveal sessions taste one
      // bottle at a time via a dedicated flow, and seen sessions see every
      // bottle at once via their own flow. See README "Tasting modes".
      if (data.session.tastingMode === "course_reveal") {
        router.replace(`/session/${params.publicId}/active`);
        return;
      }
      if (data.session.tastingMode === "seen") {
        router.replace(`/session/${params.publicId}/seen`);
        return;
      }

      setGuestName(data.guest.displayName);
      setWines(data.wines);
      setGuesses(
        data.wines.map((wine) => {
          const existing = data.guesses.find((g) => g.wineId === wine.id);
          return existing ? mapGuestGuessDtoToWineGuess(existing) : emptyWineGuess(wine.id);
        })
      );

      setLoadState(data.guest.completedAt !== null ? "locked" : "ready");

      // Host-only live group-progress count (see README "Host per-bottle
      // response progress" — "Host guess screen group progress"). This local
      // host-token check is a UI-only decision, exactly like
      // HostControlsLink's — get_host_guess_progress independently
      // re-verifies this guest token actually belongs to the session's host
      // before returning anything, so a non-host can never trigger or see
      // this fetch's result even if this check were somehow bypassed. The
      // fetch itself happens in the effect below, keyed on the currently
      // viewed wine — see README "Own-bottle guessing exclusion".
      if (getHostToken(params.publicId) && data.wines.length > 0) {
        setSessionId(data.session.id);
        setIsHost(true);
      }
    })();
  }, [params.publicId, router]);

  // Host-only group-progress fetch for whichever wine is currently shown.
  // Re-runs on every Previous/Next navigation, unlike before this bottle's
  // own contributor could be excluded from a bottle's eligible/submitted
  // count (see README "Own-bottle guessing exclusion") — different bottles
  // can now report different counts, so "any wine" is no longer a valid
  // stand-in for "every wine".
  useEffect(() => {
    if (!isHost || wines.length === 0) return;
    const supabase = getSupabaseBrowserClient();
    const token = guestTokenRef.current;
    if (!supabase || !token) return;
    const wineId = wines[currentIndex]?.id;
    if (!wineId) return;

    latestWineIdRef.current = wineId;
    getHostGuessProgress(supabase, token, wineId).then(({ data: progress }) => {
      if (latestWineIdRef.current === wineId) {
        setHostGuessProgress(progress);
      }
    });
  }, [isHost, wines, currentIndex]);

  // Live refresh for the host-only group-progress count above. `guests` is
  // realtime-enabled (unlike wine_guesses — see README "Host per-bottle
  // response progress"), so a participant's completed_at flip (their final
  // submit) is broadcast here directly, the same mechanism
  // HostControlClient already uses for its own guests-table subscription.
  // Always re-fetches for whichever wine is currently displayed (via
  // latestWineIdRef, kept current by the effect above) rather than a fixed
  // bottle.
  useEffect(() => {
    if (!isHost || !sessionId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const token = guestTokenRef.current;
    if (!token) return;

    const channel = supabase
      .channel(`host-guess-progress-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guests", filter: `session_id=eq.${sessionId}` },
        async () => {
          const wineId = latestWineIdRef.current;
          if (!wineId) return;
          const { data: progress } = await getHostGuessProgress(supabase, token, wineId);
          if (latestWineIdRef.current === wineId) {
            setHostGuessProgress(progress);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isHost, sessionId]);

  // Re-checks session status through the same guest-token RPC the initial
  // load uses (never trusting a realtime payload's status directly) and
  // redirects once revealed. Used by both the poll fallback below and the
  // waiting screen's manual "Refresh" button.
  const checkForReveal = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const token = guestTokenRef.current;
    if (!supabase || !token) return;
    const { data } = await getGuestSessionState(supabase, token);
    if (data?.session.status === "revealed") {
      router.push(`/results/${params.publicId}`);
    }
  }, [params.publicId, router]);

  // Realtime signal for an instant transition to /results, plus an 8s poll
  // fallback (see checkForReveal above) — so a guest whose realtime channel
  // never connects isn't left on this page indefinitely once the tasting is
  // actually revealed.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`guest-session-${params.publicId}`)
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
          if (next.status === "revealed") {
            router.push(`/results/${params.publicId}`);
          }
        }
      )
      .subscribe();

    const pollId = setInterval(checkForReveal, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [params.publicId, router, checkForReveal]);

  // Bottle-by-bottle reveal progress for the "locked"/"submitted" waiting
  // screen below (see README "Results reveal") — reuses the exact same
  // get_revealed_bottles_summary the participant results hub already uses,
  // so this never fetches anything new to the app, only earlier than the
  // hub itself is reached. Realtime-signal-plus-poll-fallback, matching
  // ResultsHubClient.tsx's own convention for the same data.
  const refreshRevealProgress = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const token = guestTokenRef.current;
    if (!supabase || !token) return;
    const { data } = await getRevealedBottlesSummary(supabase, token);
    if (data) setRevealProgress(data);
  }, []);

  useEffect(() => {
    if (loadState !== "locked" && loadState !== "submitted") return;
    refreshRevealProgress();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`guest-reveal-progress-${params.publicId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wines" }, () =>
        refreshRevealProgress()
      )
      .subscribe();

    const pollId = setInterval(refreshRevealProgress, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [loadState, params.publicId, refreshRevealProgress]);

  function updateGuess(wineId: string, next: WineGuess) {
    setGuesses((prev) => prev.map((g) => (g.wineId === wineId ? next : g)));
    scheduleSave(wineId, next);
    setRatingErrorWineId(null);
    setBlendErrorWineId(null);
    setOtherGrapeErrorWineId(null);
  }

  async function goToIndex(index: number) {
    await flushSave();
    setCurrentIndex(index);
  }

  async function handleSubmitTasting() {
    // Own-bottle guessing exclusion (see README): a contributor's own
    // bottle is never part of their required-submission set, mirroring the
    // exact same exclusion complete_guest_submission enforces server-side.
    const requiredWines = winesRequiringGuess(wines);

    const missingWine = requiredWines.find((wine) => {
      const guess = guesses.find((g) => g.wineId === wine.id);
      return !guess || guess.rating === null;
    });
    if (missingWine) {
      const missingIndex = wines.findIndex((w) => w.id === missingWine.id);
      setCurrentIndex(missingIndex);
      setRatingErrorWineId(missingWine.id);
      return;
    }

    const incompleteBlendWine = requiredWines.find((wine) => {
      const guess = guesses.find((g) => g.wineId === wine.id);
      return guess && hasIncompleteBlend(guess);
    });
    if (incompleteBlendWine) {
      const incompleteIndex = wines.findIndex((w) => w.id === incompleteBlendWine.id);
      setCurrentIndex(incompleteIndex);
      setBlendErrorWineId(incompleteBlendWine.id);
      return;
    }

    const invalidOtherGrapeWine = requiredWines.find((wine) => {
      const guess = guesses.find((g) => g.wineId === wine.id);
      return guess && invalidOtherGrapeGuessMessage(guess) !== undefined;
    });
    if (invalidOtherGrapeWine) {
      const invalidIndex = wines.findIndex((w) => w.id === invalidOtherGrapeWine.id);
      setCurrentIndex(invalidIndex);
      setOtherGrapeErrorWineId(invalidOtherGrapeWine.id);
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    await flushSave();

    const supabase = getSupabaseBrowserClient();
    const token = guestTokenRef.current;
    if (!supabase || !token) {
      setSubmitError("Supabase isn't configured for this app yet.");
      setSubmitting(false);
      return;
    }

    const { error } = await completeSubmission(supabase, token);
    setSubmitting(false);
    if (error) {
      setSubmitError(friendlyRpcError(error));
      return;
    }
    setLoadState("submitted");
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

  if (loadState === "locked" || loadState === "submitted") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex items-center gap-2">
          <HomeLink />
          <HostControlsLink sessionPublicId={params.publicId} />
          <ResultsLink href={`/tasting/${params.publicId}/results`} />
          <ArchiveLink />
        </div>
        <div className="w-full border-t border-cellar-gold/40 pt-5">
          <h1 className="font-display text-2xl font-semibold text-cellar-maroon-dark">
            Your guesses are locked
          </h1>
          <p className="mt-2 text-sm text-cellar-muted">
            {guestName ? `Thanks, ${guestName}! ` : ""}
            Waiting for the host to reveal the wines. This page will update
            automatically.
          </p>
          {revealProgress && revealProgress.totalCount > 0 && (
            <p className="mt-3 text-sm font-medium text-cellar-text">
              {revealProgress.revealedCount} of {revealProgress.totalCount} bottles revealed
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              refreshRevealProgress();
              checkForReveal();
            }}
          >
            Refresh
          </Button>
        </div>
      </main>
    );
  }

  const wine = wines[currentIndex];
  const guess = guesses.find((g) => g.wineId === wine.id);
  if (!guess) return null;
  const isLast = currentIndex === wines.length - 1;
  const contributorLabelInput = {
    contributorDisplayName: wine.contributorName,
    styleBucket: wine.contributorStyleBucket,
    contributorStyleSequence: wine.contributorStyleSequence,
  };
  const bottleLabels = buildBottleDisplayLabels(wine.bottleNumber, contributorLabelInput);
  const bottleAccessibleLabel = formatBottleAccessibleLabel(wine.bottleNumber, contributorLabelInput);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink confirmBeforeLeave hasUnsavedChanges={saveState === "saving"} />
        <HostControlsLink
          sessionPublicId={params.publicId}
          confirmBeforeLeave
          hasUnsavedChanges={saveState === "saving"}
        />
        <ResultsLink href={`/tasting/${params.publicId}/results`} />
      </div>
      <div>
        <SectionEyebrow>Blind tasting</SectionEyebrow>
        <p className="mt-1 text-sm text-cellar-muted">Tasting as {guestName}</p>
      </div>

      <ProgressBar
        current={currentIndex + 1}
        total={wines.length}
        label={`${bottleLabels.tastingOrderLabel} — ${currentIndex + 1} of ${wines.length}`}
      />

      {!wine.isOwnBottle && <GuessGroupProgress progress={hostGuessProgress} />}

      {wine.isOwnBottle ? (
        <OwnerBottleView bottleLabels={bottleLabels} bottleAccessibleLabel={bottleAccessibleLabel} />
      ) : (
        <WineGuessForm
          key={wine.id}
          bottleLabels={bottleLabels}
          bottleAccessibleLabel={bottleAccessibleLabel}
          value={guess}
          onChange={(next) => updateGuess(wine.id, next)}
          styleHint={wine.styleHint}
          ratingError={
            ratingErrorWineId === wine.id ? "A rating is required." : undefined
          }
          blendError={
            blendErrorWineId === wine.id
              ? BLEND_MIN_GRAPES_MESSAGE
              : otherGrapeErrorWineId === wine.id
                ? invalidOtherGrapeGuessMessage(guess)
                : undefined
          }
        />
      )}

      {!wine.isOwnBottle && <SavingIndicator state={saveState} />}

      {submitError && (
        <p role="alert" className="rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger">
          {submitError}
        </p>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          fullWidth
          disabled={currentIndex === 0}
          onClick={() => goToIndex(Math.max(0, currentIndex - 1))}
        >
          Previous
        </Button>
        {isLast ? (
          <Button type="button" fullWidth onClick={handleSubmitTasting} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit all guesses"}
          </Button>
        ) : (
          <Button
            type="button"
            fullWidth
            onClick={() => goToIndex(Math.min(wines.length - 1, currentIndex + 1))}
          >
            Next
          </Button>
        )}
      </div>
    </main>
  );
}
