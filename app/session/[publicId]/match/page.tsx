"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatusChip } from "@/components/StatusChip";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { ArchiveLink } from "@/components/navigation/ArchiveLink";
import { SaveState } from "@/components/SavingIndicator";
import { MatchBottleDraft, MatchBottleRow } from "@/components/match/MatchBottleRow";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMatchTastingState, upsertMatchGuess } from "@/lib/supabase/guestActions";
import { MatchBottleDTO, MatchWineListEntryDTO } from "@/lib/supabase/types";
import { getGuestToken } from "@/lib/deviceStorage";

type LoadState = "loading" | "no-config" | "invalid-token" | "ready";

// Manual-refresh fallback poll — wine_guesses (where matches/ratings live) is
// deliberately never realtime-broadcast (see README "Tasting modes"), so
// this page can't learn about a change saved from this same guest's other
// tab/device except by polling its own scoped RPC response, same as Seen.
const MATCH_LIST_POLL_MS = 8000;

/**
 * One page listing every glass in a Blind match session (see README
 * "Tasting modes" — "Blind match"): the full wine list is visible from the
 * start, and a participant matches, scores, and notes every glass here,
 * revising freely in any order until the host ends the tasting. Unlike
 * course_reveal, there is no Previous/Next pacing or active-bottle
 * restriction; unlike Seen, matching a glass to the wrong wine actually
 * scores wrong (see supabase/schema.sql's upsert_match_guess).
 */
export default function BlindMatchTastingPage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();
  const guestTokenRef = useRef<string | null>(null);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [guestName, setGuestName] = useState("");
  const [tastingTitle, setTastingTitle] = useState("");
  const [tastingDate, setTastingDate] = useState("");
  const [wineList, setWineList] = useState<MatchWineListEntryDTO[]>([]);
  const [bottles, setBottles] = useState<MatchBottleDTO[]>([]);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  const pendingSavesRef = useRef<Record<string, MatchBottleDraft>>({});
  const saveTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const performSave = useCallback(async (wineId: string) => {
    const supabase = getSupabaseBrowserClient();
    const token = guestTokenRef.current;
    const pending = pendingSavesRef.current[wineId];
    if (!supabase || !token || !pending) return;
    delete pendingSavesRef.current[wineId];

    const { error } = await upsertMatchGuess(
      supabase,
      token,
      wineId,
      pending.matchedWineId,
      pending.rating,
      pending.note
    );
    setSaveStates((prev) => ({ ...prev, [wineId]: error ? "error" : "saved" }));
  }, []);

  const scheduleSave = useCallback(
    (wineId: string, next: MatchBottleDraft) => {
      pendingSavesRef.current[wineId] = next;
      setSaveStates((prev) => ({ ...prev, [wineId]: "saving" }));
      if (saveTimeoutsRef.current[wineId]) clearTimeout(saveTimeoutsRef.current[wineId]);
      saveTimeoutsRef.current[wineId] = setTimeout(() => {
        performSave(wineId);
      }, 600);
    },
    [performSave]
  );

  const handleRowChange = useCallback(
    (wineId: string, next: MatchBottleDraft) => {
      setBottles((prev) =>
        prev.map((b) =>
          b.id === wineId
            ? { ...b, myMatchedWineId: next.matchedWineId, myRating: next.rating, myNote: next.note }
            : b
        )
      );
      scheduleSave(wineId, next);
    },
    [scheduleSave]
  );

  const refresh = useCallback(async () => {
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

    const { data, error } = await getMatchTastingState(supabase, token);
    if (error || !data) {
      setLoadState("invalid-token");
      return;
    }
    if (data.session.status === "revealed") {
      router.replace(`/results/${params.publicId}`);
      return;
    }
    // Defensive — this route is blind_match-only, same pattern as Seen's
    // and course_reveal's own mode checks.
    if (data.session.tastingMode !== "blind_match") {
      router.replace(`/tasting/${params.publicId}`);
      return;
    }

    setGuestName(data.guestName);
    setTastingTitle(data.session.title);
    setTastingDate(data.session.tastingDate);
    setWineList(data.wineList);
    // Never clobber a glass currently mid-edit (a pending debounced save or
    // an in-flight one) with a stale poll response — same guard shape as
    // every other autosave page in this app.
    setBottles((prev) =>
      data.bottles.map((next) => (pendingSavesRef.current[next.id] ? prev.find((b) => b.id === next.id) ?? next : next))
    );
    setLoadState("ready");
  }, [params.publicId, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`match-list-${params.publicId}`)
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

    const pollId = setInterval(refresh, MATCH_LIST_POLL_MS);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [params.publicId, refresh]);

  if (loadState === "loading") {
    return <LoadingState message="Gathering the wine list…" />;
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

  const matchedCount = bottles.filter((b) => b.myMatchedWineId !== null).length;
  const eyebrow = [
    tastingTitle,
    tastingDate
      ? new Date(tastingDate).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <HostControlsLink sessionPublicId={params.publicId} />
        <ArchiveLink />
      </div>

      <PageHeader
        eyebrow={eyebrow}
        title="Match each glass to a wine"
        supporting="The wine list below is the full lineup. Pick which wine each numbered glass is, score it, and jot a note — revise anytime until the host reveals the answers."
        action={<StatusChip tone="active">Blind match in progress</StatusChip>}
      />

      <p className="text-sm text-cellar-muted">
        Tasting as {guestName} · You have matched {matchedCount} of {bottles.length} glasses
      </p>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-muted">
          The wine list
        </h2>
        <Card className="flex flex-col gap-1 text-sm text-cellar-text/80">
          {wineList.map((wine) => (
            <p key={wine.id}>
              {wine.producer} — {wine.wineCuvee} {wine.vintage}
            </p>
          ))}
        </Card>
      </div>

      <Card className="divide-y divide-cellar-border p-0">
        {bottles.map((bottle) => (
          <MatchBottleRow
            key={bottle.id}
            bottle={bottle}
            wineList={wineList}
            saveState={saveStates[bottle.id] ?? "idle"}
            disabled={false}
            onChange={(next) => handleRowChange(bottle.id, next)}
          />
        ))}
      </Card>
    </main>
  );
}
