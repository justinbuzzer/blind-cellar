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
import { ProfileLink } from "@/components/navigation/ProfileLink";
import { TastingReportView } from "@/components/report/TastingReportView";
import { SeenTastingReportView } from "@/components/report/SeenTastingReportView";
import { MatchTastingReportView } from "@/components/report/MatchTastingReportView";
import { ClaimPanel } from "@/components/archive/ClaimPanel";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadTastingReportData } from "@/lib/supabase/reportData";
import { buildReportPdfFilename } from "@/lib/pdfFilename";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { getGuestToken, getHostToken } from "@/lib/deviceStorage";
import { getCreditLedger, getGuestSessionState } from "@/lib/supabase/guestActions";
import {
  isReportAvailable,
  ReportAccessResult,
  resolveReportAccessFromGuestSession,
  resolveReportAccessFromHostSession,
} from "@/lib/reportAccess";
import { ArchiveRole } from "@/lib/archive";
import { HostSessionResponse } from "@/lib/supabase/types";
import { buildCreditLedger, CreditLedgerEntry } from "@/lib/betting";
import { MatchTastingReport, SeenTastingReport, TASTING_MODE_LABELS, TastingReport } from "@/types/tasting";

type LoadState = "loading" | "no-config" | "not-authorized" | "locked" | "ready";
/** Which "From …" banner + "Back to …" link this report was opened with — a display marker only, never used for authorization. See README "Tasting archive" / "Account-linked tasting records". */
type ReportContext = "none" | "archive" | "account";

interface ClaimEligibility {
  role: ArchiveRole;
  token: string;
}

export default function ResultsPage() {
  const params = useParams<{ publicId: string }>();
  const { user, loading: authLoading } = useAuthUser();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [access, setAccess] = useState<ReportAccessResult | null>(null);
  const [report, setReport] = useState<TastingReport | null>(null);
  const [seenReport, setSeenReport] = useState<SeenTastingReport | null>(null);
  const [matchReport, setMatchReport] = useState<MatchTastingReport | null>(null);
  // Betting sub-mode only (see README "Tasting modes" — "Betting") — only
  // ever populated for a participant viewer (the host has their own
  // dedicated leaderboard/recap pages that already show credits); null for
  // every non-betting session or host viewer.
  const [creditEntries, setCreditEntries] = useState<CreditLedgerEntry[] | null>(null);
  const [myGuestId, setMyGuestId] = useState<string | null>(null);
  // Read once on mount (not via next/navigation's useSearchParams, which
  // would force this already-fully-client page into a Suspense boundary for
  // no benefit here).
  const [reportContext, setReportContext] = useState<ReportContext>("none");
  const [claimEligibility, setClaimEligibility] = useState<ClaimEligibility | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "generating" | "error">("idle");

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    setReportContext(from === "archive" || from === "account" ? from : "none");
  }, []);

  // A quiet "Add to my tasting record" prompt (see README "Account-linked
  // tasting records") — shown whenever this exact browser holds a valid
  // local token for this exact session, the viewer is signed in, and the
  // session isn't already linked to their account. Independent of
  // reportContext: someone can reach a revealed report they hold a token for
  // without having come through the archive first.
  useEffect(() => {
    if (loadState !== "ready" || authLoading || !user || !access) {
      setClaimEligibility(null);
      return;
    }

    const hostToken = getHostToken(params.publicId);
    const guestToken = getGuestToken(params.publicId);
    const local: ClaimEligibility | null = hostToken
      ? { role: "host", token: hostToken }
      : guestToken
        ? { role: "participant", token: guestToken }
        : null;

    if (!local) {
      setClaimEligibility(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data } = await supabase
        .from("account_tasting_records")
        .select("id")
        .eq("session_id", access.session.id)
        .limit(1);
      if (!cancelled) {
        setClaimEligibility(data && data.length > 0 ? null : local);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadState, authLoading, user, access, params.publicId]);

  const loadReport = useCallback(async (session: ReportAccessResult["session"]) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const data = await loadTastingReportData(supabase, {
      id: session.id,
      tastingMode: session.tastingMode,
      scoringVersion: session.scoringVersion,
    });

    if (data.kind === "seen") {
      setSeenReport(data.report);
    } else if (data.kind === "match") {
      setMatchReport(data.report);
    } else {
      setReport(data.report);
    }
    setLoadState("ready");
  }, []);

  /**
   * The only place this page decides who's allowed to see the report — see
   * README "Results reveal" and lib/reportAccess.ts. Tries the browser's
   * saved host token first, through the existing host-token Route Handler
   * (kept server-side per the same convention every other host mutation in
   * this app already follows, so the raw host token never appears in a
   * client-visible Supabase REST call); then its saved guest token, through
   * the existing guest-token RPC wrapper (called directly, exactly like
   * every other guest action in this app). Neither resolving is
   * indistinguishable from the session not existing at all — same generic
   * "Tasting not found" screen either way, so a public/non-member visitor
   * can never learn whether a real session sits behind this link. A
   * rejoined guest (recovery code or account) reaches this the same way
   * anyone else does: their browser's saved guest token already resolves to
   * their original canonical participant record (see README "Session
   * rejoin") — no separate code path needed here.
   */
  const resolveAccess = useCallback(async (): Promise<ReportAccessResult | null> => {
    const hostToken = getHostToken(params.publicId);
    if (hostToken) {
      try {
        const response = await fetch("/api/host/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId: params.publicId, hostToken }),
        });
        if (response.ok) {
          const data = (await response.json()) as HostSessionResponse;
          return resolveReportAccessFromHostSession(data);
        }
      } catch {
        // Fall through to the guest-token attempt.
      }
    }

    const guestToken = getGuestToken(params.publicId);
    if (guestToken) {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { data } = await getGuestSessionState(supabase, guestToken);
        if (data) {
          const resolved = resolveReportAccessFromGuestSession(data, params.publicId);
          if (resolved) return resolved;
        }
      }
    }

    return null;
  }, [params.publicId]);

  /**
   * Builds the same downloadable PDF for host and participant alike, from
   * data this page has already fetched and been authorized to see — no new
   * fetch, no new RPC (see README "Downloadable PDF summary"). Dynamically
   * imports both @react-pdf/renderer and the matching document component so
   * that ~1MB PDF-generation library only ever loads into a browser that
   * actually clicks the button, never into this page's initial bundle.
   */
  const handleDownloadPdf = useCallback(async () => {
    if (!access || (!report && !seenReport && !matchReport)) return;
    setPdfState("generating");
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const modeLabelForPdf = TASTING_MODE_LABELS[access.session.tastingMode];
      const dateLabelForPdf = access.session.tastingDate
        ? new Date(access.session.tastingDate).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "";

      let blob: Blob;
      if (seenReport) {
        const { SeenTastingReportPdfDocument } = await import(
          "@/components/report/pdf/SeenTastingReportPdfDocument"
        );
        blob = await pdf(
          <SeenTastingReportPdfDocument
            report={seenReport}
            title={access.session.title}
            dateLabel={dateLabelForPdf}
            modeLabel={modeLabelForPdf}
          />
        ).toBlob();
      } else if (matchReport) {
        const { MatchTastingReportPdfDocument } = await import(
          "@/components/report/pdf/MatchTastingReportPdfDocument"
        );
        blob = await pdf(
          <MatchTastingReportPdfDocument
            report={matchReport}
            title={access.session.title}
            dateLabel={dateLabelForPdf}
            modeLabel={modeLabelForPdf}
          />
        ).toBlob();
      } else {
        const { TastingReportPdfDocument } = await import(
          "@/components/report/pdf/TastingReportPdfDocument"
        );
        blob = await pdf(
          <TastingReportPdfDocument
            report={report!}
            title={access.session.title}
            dateLabel={dateLabelForPdf}
            modeLabel={modeLabelForPdf}
            showNotes={access.role === "participant"}
            creditEntries={creditEntries ?? undefined}
          />
        ).toBlob();
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildReportPdfFilename(access.session.title, access.session.tastingDate);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setPdfState("idle");
    } catch {
      setPdfState("error");
    }
  }, [access, report, seenReport, matchReport, creditEntries]);

  const refresh = useCallback(async () => {
    const resolved = await resolveAccess();
    if (!resolved) {
      setLoadState("not-authorized");
      return;
    }
    setAccess(resolved);
    if (!isReportAvailable(resolved.session)) {
      setLoadState("locked");
      return;
    }
    await loadReport(resolved.session);

    // Betting sub-mode only — see the creditEntries state comment above.
    // Fails harmlessly (betting_not_enabled) for a non-betting session,
    // which just leaves creditEntries null.
    if (resolved.role === "participant") {
      const guestToken = getGuestToken(params.publicId);
      const supabase = getSupabaseBrowserClient();
      if (guestToken && supabase) {
        const { data: ledgerData } = await getCreditLedger(supabase, guestToken);
        if (ledgerData) {
          setCreditEntries(buildCreditLedger(ledgerData).entries);
          setMyGuestId(ledgerData.myGuestId);
        }
      }
    }
  }, [resolveAccess, loadReport, params.publicId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (loadState !== "locked" || !access) return;
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
        () => {
          // Never trust the realtime payload's status directly — re-resolve
          // through the same authorized path so completion is always
          // verified server-side on every load, not inferred from a
          // broadcast.
          refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadState, access, params.publicId, refresh]);

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

  if (loadState === "not-authorized") {
    return (
      <UnavailableScreen
        title="Tasting not found"
        message="This results link doesn't match a tasting. Double-check the link from your host."
      />
    );
  }

  if (loadState === "locked") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex items-center gap-2">
          <HomeLink />
          <ArchiveLink />
          <AccountNav />
        </div>
        <div className="w-full border-t border-cellar-gold/40 pt-5">
          <h1 className="font-display text-2xl font-semibold text-cellar-maroon-dark">
            Not available yet
          </h1>
          <p className="mt-2 text-sm text-cellar-muted">
            The tasting report will be available when the tasting is complete.
          </p>
        </div>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </main>
    );
  }

  if ((!report && !seenReport && !matchReport) || !access) return null;

  const modeLabel = TASTING_MODE_LABELS[access.session.tastingMode];
  const dateLabel = access.session.tastingDate
    ? new Date(access.session.tastingDate).toLocaleDateString(undefined, {
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
        <ProfileLink />
        <AccountNav />
      </div>

      {reportContext !== "none" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cellar-gold/40 pb-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-cellar-gold">
            {reportContext === "account" ? "From your record" : "From the archive"}
          </p>
          <Link
            href={reportContext === "account" ? "/archive?tab=account" : "/archive"}
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-cellar-maroon underline-offset-4 transition-colors hover:text-cellar-maroon-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
          >
            {reportContext === "account" ? "← Back to your record" : "← Back to archive"}
          </Link>
        </div>
      )}

      <PageHeader
        eyebrow="The tasting report"
        title={access.session.title}
        supporting={[dateLabel, modeLabel].filter(Boolean).join(" · ")}
      />

      <div className="flex flex-col items-start gap-1.5">
        <Button type="button" variant="secondary" onClick={handleDownloadPdf} disabled={pdfState === "generating"}>
          {pdfState === "generating" ? "Preparing PDF…" : "Download PDF summary"}
        </Button>
        {pdfState === "error" && (
          <p className="text-xs text-cellar-danger">Couldn&rsquo;t generate the PDF. Please try again.</p>
        )}
      </div>

      {claimEligibility && (
        <ClaimPanel
          publicId={params.publicId}
          role={claimEligibility.role}
          token={claimEligibility.token}
          onClaimed={() => setClaimEligibility(null)}
        />
      )}

      {seenReport ? (
        <SeenTastingReportView report={seenReport} />
      ) : matchReport ? (
        <MatchTastingReportView report={matchReport} />
      ) : (
        report && (
          <TastingReportView
            report={report}
            showNotes={access.role === "participant"}
            creditEntries={creditEntries ?? undefined}
            myGuestId={myGuestId ?? undefined}
          />
        )
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
