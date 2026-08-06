"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { ArchiveLink } from "@/components/navigation/ArchiveLink";
import { AccountNav } from "@/components/navigation/AccountNav";
import { TastingReportView } from "@/components/report/TastingReportView";
import { SeenTastingReportView } from "@/components/report/SeenTastingReportView";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadTastingReportData } from "@/lib/supabase/reportData";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { SessionRow } from "@/lib/supabase/types";
import { SeenTastingReport, TASTING_MODE_LABELS, TastingReport } from "@/types/tasting";

type LoadState = "loading" | "no-config" | "not-found" | "waiting" | "ready";

export default function ResultsPage() {
  const params = useParams<{ publicId: string }>();
  const { user, loading: authLoading } = useAuthUser();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [sessionRow, setSessionRow] = useState<SessionRow | null>(null);
  const [report, setReport] = useState<TastingReport | null>(null);
  const [seenReport, setSeenReport] = useState<SeenTastingReport | null>(null);
  // Read once on mount (not via next/navigation's useSearchParams, which
  // would force this already-fully-client page into a Suspense boundary for
  // no benefit here) — purely a display marker, never used for
  // authorization. See README "Tasting archive".
  const [fromArchive, setFromArchive] = useState(false);

  useEffect(() => {
    setFromArchive(new URLSearchParams(window.location.search).get("from") === "archive");
  }, []);

  const loadReport = useCallback(async (session: SessionRow) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const data = await loadTastingReportData(supabase, {
      id: session.id,
      tastingMode: session.tasting_mode,
    });

    if (data.kind === "seen") {
      setSeenReport(data.report);
    } else {
      setReport(data.report);
    }
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
    return <LoadingState message="Gathering the evening's notes…" />;
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
        <div className="flex items-center gap-2">
          <HomeLink />
          <ArchiveLink />
          <AccountNav />
        </div>
        <div className="w-full border-t border-cellar-gold/40 pt-5">
          <h1 className="font-display text-2xl font-semibold text-cellar-maroon-dark">
            Not revealed yet
          </h1>
          <p className="mt-2 text-sm text-cellar-muted">
            {sessionRow?.title ? `"${sessionRow.title}" is` : "This tasting is"}{" "}
            still collecting guesses. This page will update automatically once
            the host reveals the results.
          </p>
        </div>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </main>
    );
  }

  if (!report && !seenReport) return null;

  const modeLabel = sessionRow ? TASTING_MODE_LABELS[sessionRow.tasting_mode] : "";
  const dateLabel = sessionRow?.tasting_date
    ? new Date(sessionRow.tasting_date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <ArchiveLink />
        <AccountNav />
      </div>

      {fromArchive && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cellar-gold/40 pb-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-cellar-gold">
            From the archive
          </p>
          <Link
            href="/archive"
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-cellar-maroon underline-offset-4 transition-colors hover:text-cellar-maroon-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
          >
            ← Back to archive
          </Link>
        </div>
      )}

      <PageHeader
        eyebrow="The tasting report"
        title={sessionRow?.title ?? ""}
        supporting={[dateLabel, modeLabel].filter(Boolean).join(" · ")}
      />

      {seenReport ? (
        <SeenTastingReportView report={seenReport} />
      ) : (
        report && <TastingReportView report={report} />
      )}

      {!authLoading && !user && (
        <p className="border-t border-cellar-border pt-4 text-center text-xs text-cellar-muted">
          Keep future tasting records across devices.{" "}
          <Link
            href={`/account/sign-in?redirect=${encodeURIComponent(`/results/${params.publicId}`)}`}
            className="font-medium text-cellar-maroon underline-offset-4 hover:text-cellar-maroon-dark hover:underline"
          >
            Continue with email
          </Link>
        </p>
      )}
    </main>
  );
}
