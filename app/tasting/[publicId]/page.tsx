"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { ProgressBar } from "@/components/ProgressBar";
import { WineGuessForm } from "@/components/WineGuessForm";
import { SavingIndicator, SaveState } from "@/components/SavingIndicator";
import { HomeLink } from "@/components/navigation/HomeLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  completeSubmission,
  getGuestSessionState,
  upsertGuess,
} from "@/lib/supabase/guestActions";
import { friendlyRpcError, GuestSessionWineDTO } from "@/lib/supabase/types";
import { mapGuestGuessDtoToWineGuess } from "@/lib/supabase/mappers";
import { emptyWineGuess } from "@/lib/guess";
import { getGuestToken } from "@/lib/deviceStorage";
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
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const guestTokenRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ wineId: string; guess: WineGuess } | null>(null);

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

      setGuestName(data.guest.displayName);
      setWines(data.wines);
      setGuesses(
        data.wines.map((wine) => {
          const existing = data.guesses.find((g) => g.wineId === wine.id);
          return existing ? mapGuestGuessDtoToWineGuess(existing) : emptyWineGuess(wine.id);
        })
      );

      setLoadState(data.guest.completedAt !== null ? "locked" : "ready");
    })();
  }, [params.publicId, router]);

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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [params.publicId, router]);

  function updateGuess(wineId: string, next: WineGuess) {
    setGuesses((prev) => prev.map((g) => (g.wineId === wineId ? next : g)));
    scheduleSave(wineId, next);
    setRatingErrorWineId(null);
  }

  async function goToIndex(index: number) {
    await flushSave();
    setCurrentIndex(index);
  }

  async function handleSubmitTasting() {
    const missingWine = wines.find((wine) => {
      const guess = guesses.find((g) => g.wineId === wine.id);
      return !guess || guess.rating === null;
    });
    if (missingWine) {
      const missingIndex = wines.findIndex((w) => w.id === missingWine.id);
      setCurrentIndex(missingIndex);
      setRatingErrorWineId(missingWine.id);
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

  if (loadState === "locked" || loadState === "submitted") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <HomeLink />
        <div className="text-4xl" aria-hidden="true">
          🔒
        </div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">
          Your guesses are locked
        </h1>
        <p className="text-sm text-cellar-text/70">
          {guestName ? `Thanks, ${guestName}! ` : ""}
          Waiting for the host to reveal the wines. This page will update
          automatically.
        </p>
      </main>
    );
  }

  const wine = wines[currentIndex];
  const guess = guesses.find((g) => g.wineId === wine.id);
  if (!guess) return null;
  const isLast = currentIndex === wines.length - 1;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <HomeLink confirmBeforeLeave hasUnsavedChanges={saveState === "saving"} />
      <div>
        <p className="text-sm text-cellar-text/60">Tasting as {guestName}</p>
      </div>

      <ProgressBar
        current={currentIndex + 1}
        total={wines.length}
        label={`Bottle ${currentIndex + 1} of ${wines.length}`}
      />

      <WineGuessForm
        wineCode={wine.anonymousCode}
        value={guess}
        onChange={(next) => updateGuess(wine.id, next)}
        ratingError={
          ratingErrorWineId === wine.id ? "A rating is required." : undefined
        }
      />

      <SavingIndicator state={saveState} />

      {submitError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
