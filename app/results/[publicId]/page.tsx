"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/Button";
import { TastingReportView } from "@/components/report/TastingReportView";
import { SeenTastingReportView } from "@/components/report/SeenTastingReportView";
import { HomeLink } from "@/components/navigation/HomeLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildCourseRevealSubmissions,
  buildRevealedSubmissions,
  mapRevealedWineRowToAnswerKey,
} from "@/lib/supabase/mappers";
import { buildSeenTastingReport, SeenRatingRow } from "@/lib/seenResults";
import { SessionRow } from "@/lib/supabase/types";
import { buildTastingReport } from "@/lib/results";
import { SeenTastingReport, TastingReport, TastingSession } from "@/types/tasting";

type LoadState = "loading" | "no-config" | "not-found" | "waiting" | "ready";

export default function ResultsPage() {
  const params = useParams<{ publicId: string }>();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [sessionRow, setSessionRow] = useState<SessionRow | null>(null);
  const [report, setReport] = useState<TastingReport | null>(null);
  const [seenReport, setSeenReport] = useState<SeenTastingReport | null>(null);

  const loadReport = useCallback(async (session: SessionRow) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const [{ data: wineRows }, { data: guestRows }, { data: guessRows }] = await Promise.all([
      supabase
        .from("guest_visible_wines")
        .select("*")
        .eq("session_id", session.id)
        .order("bottle_number", { ascending: true }),
      supabase
        .from("guests")
        .select("id, display_name, completed_at")
        .eq("session_id", session.id),
      supabase.from("revealed_wine_guesses").select("*").eq("session_id", session.id),
    ]);

    const guestNameById = new Map((guestRows ?? []).map((g) => [g.id, g.display_name]));

    const wines = (wineRows ?? []).map((row) => ({
      ...mapRevealedWineRowToAnswerKey(row),
      contributorName: row.contributor_guest_id
        ? guestNameById.get(row.contributor_guest_id)
        : undefined,
    }));

    // Seen tasting has no identification guesses or scoring at all — its
    // report is built by an entirely separate, rating-only pipeline (see
    // lib/seenResults.ts) rather than forced through buildTastingReport,
    // which full_blind/course_reveal below are untouched by.
    if (session.tasting_mode === "seen") {
      const ratingRows: SeenRatingRow[] = (guessRows ?? []).map((row) => ({
        wineId: row.wine_id,
        guestId: row.guest_id,
        rating: row.rating,
        note: row.tasting_note ?? undefined,
      }));
      const guests = (guestRows ?? []).map((g) => ({ id: g.id, displayName: g.display_name }));
      setSeenReport(buildSeenTastingReport(wines, guests, ratingRows));
      setLoadState("ready");
      return;
    }

    const domainSession: TastingSession = {
      id: session.id,
      code: session.join_code,
      title: session.title,
      date: session.tasting_date,
      status: session.status,
      createdAt: session.created_at,
      wines,
    };

    const submissions =
      session.tasting_mode === "course_reveal"
        ? buildCourseRevealSubmissions(
            guessRows ?? [],
            (guestRows ?? []).map((g) => ({ id: g.id, displayName: g.display_name }))
          )
        : buildRevealedSubmissions(
            guessRows ?? [],
            (guestRows ?? [])
              .filter((g) => g.completed_at !== null)
              .map((g) => ({ id: g.id, displayName: g.display_name }))
          );

    setReport(buildTastingReport(domainSession, submissions));
    setLoadState("ready");
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("tasting_sessions")
        .select(
          "id, public_id, join_code, title, tasting_date, status, created_at, updated_at, tasting_mode"
        )
        .eq("public_id", params.publicId)
        .maybeSingle();

      if (!data) {
        setLoadState("not-found");
        return;
      }
      setSessionRow(data);

      if (data.status === "revealed") {
        await loadReport(data);
      } else {
        setLoadState("waiting");
      }
    })();
  }, [params.publicId, loadReport]);

  useEffect(() => {
    if (loadState !== "waiting" || !sessionRow) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`results-${params.publicId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasting_sessions",
          filter: `public_id=eq.${params.publicId}`,
        },
        async (payload) => {
          const next = payload.new as { status?: string };
          if (next.status === "revealed") {
            await loadReport(sessionRow);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadState, sessionRow, params.publicId, loadReport]);

  if (loadState === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6">
        <p className="text-sm text-cellar-text/60">Loading results…</p>
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

  if (loadState === "not-found") {
    return (
      <UnavailableScreen
        title="Tasting not found"
        message="This results link doesn't match a tasting. Double-check the link from your host."
      />
    );
  }

  if (loadState === "waiting") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <HomeLink />
        <h1 className="text-xl font-semibold text-cellar-maroon-dark">
          Not revealed yet
        </h1>
        <p className="text-sm text-cellar-text/70">
          {sessionRow?.title ? `"${sessionRow.title}" is` : "This tasting is"}{" "}
          still collecting guesses. This page will update automatically once
          the host reveals the results.
        </p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </main>
    );
  }

  if (!report && !seenReport) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <HomeLink />
      <div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">
          {sessionRow?.title}
        </h1>
        <p className="mt-1 text-sm text-cellar-text/70">Results revealed</p>
      </div>
      {seenReport ? (
        <SeenTastingReportView report={seenReport} />
      ) : (
        report && <TastingReportView report={report} />
      )}
    </main>
  );
}

function UnavailableScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <HomeLink />
      <h1 className="text-xl font-semibold text-cellar-maroon-dark">{title}</h1>
      <p className="text-sm text-cellar-text/70">{message}</p>
    </main>
  );
}
