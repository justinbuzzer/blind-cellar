"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HomeLink } from "@/components/navigation/HomeLink";
import { ArchiveLink } from "@/components/navigation/ArchiveLink";
import { AccountNav } from "@/components/navigation/AccountNav";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { ScopeSaveState, TastingScopeControl } from "@/components/profile/TastingScopeControl";
import { AtAGlanceStrip } from "@/components/profile/AtAGlanceStrip";
import { BlindPalateSection } from "@/components/profile/BlindPalateSection";
import { WineRecordSection } from "@/components/profile/WineRecordSection";
import { RecentEveningsList } from "@/components/profile/RecentEveningsList";
import { TastedWinesLedger } from "@/components/profile/TastedWinesLedger";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import {
  AtAGlance,
  BlindPalate,
  DEFAULT_TASTING_SCOPE,
  isValidTastingScope,
  RecentEvening,
  TastingScope,
  WineRecord,
} from "@/lib/profile";

type SummaryLoadState = "loading" | "unavailable" | "ready";

interface ProfileSummaryResponse {
  scope: TastingScope;
  atAGlance: AtAGlance;
  blindPalate: BlindPalate;
  wineRecord: WineRecord;
  recentEvenings: RecentEvening[];
}

/**
 * The private Palate Profile (see README "Palate Profile"). Signed-out
 * visitors are redirected to sign-in with a safe return path; every metric
 * on this page comes from the signed-in caller's own account-linked
 * records, fetched server-side via /api/profile and /api/profile/ledger —
 * this component never queries tasting_sessions/wines/wine_guesses directly.
 */
export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();

  const [configState, setConfigState] = useState<"checking" | "no-config" | "configured">("checking");
  const [scope, setScope] = useState<TastingScope>(DEFAULT_TASTING_SCOPE);
  const [scopeInitialized, setScopeInitialized] = useState(false);
  const [scopeSaveState, setScopeSaveState] = useState<ScopeSaveState>("idle");

  const [summaryState, setSummaryState] = useState<SummaryLoadState>("loading");
  const [summary, setSummary] = useState<ProfileSummaryResponse | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    setConfigState(supabase ? "configured" : "no-config");
  }, []);

  useEffect(() => {
    if (authLoading || configState !== "configured" || user) return;
    router.replace("/account/sign-in?redirect=/profile");
  }, [authLoading, configState, user, router]);

  // Resolve the initial scope once: a valid `?scope=` query param wins (for
  // shareable/bookmarked navigation state — see README "Palate Profile"),
  // otherwise the user's own saved preference, otherwise the default. This
  // never writes anything back — only handleScopeChange below persists.
  useEffect(() => {
    if (scopeInitialized || !user) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    (async () => {
      const urlScope = new URLSearchParams(window.location.search).get("scope");
      if (isValidTastingScope(urlScope)) {
        setScope(urlScope);
        setScopeInitialized(true);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("include_seen_tastings")
        .eq("id", user.id)
        .maybeSingle();

      setScope(profile?.include_seen_tastings ? "include_seen" : "blind_only");
      setScopeInitialized(true);
    })();
  }, [scopeInitialized, user]);

  useEffect(() => {
    if (!scopeInitialized || !user) return;
    let cancelled = false;
    setSummaryState("loading");

    (async () => {
      try {
        const response = await fetch(`/api/profile?scope=${scope}`);
        if (!response.ok) {
          if (!cancelled) setSummaryState("unavailable");
          return;
        }
        const json = (await response.json()) as ProfileSummaryResponse;
        if (!cancelled) {
          setSummary(json);
          setSummaryState("ready");
        }
      } catch {
        if (!cancelled) setSummaryState("unavailable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope, scopeInitialized, user]);

  const handleScopeChange = useCallback(
    async (next: TastingScope) => {
      setScope(next);
      router.replace(`/profile?scope=${next}`, { scroll: false });

      if (!user) return;
      setScopeSaveState("saving");
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setScopeSaveState("error");
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ include_seen_tastings: next === "include_seen" })
        .eq("id", user.id);
      setScopeSaveState(error ? "error" : "saved");
    },
    [router, user]
  );

  if (configState === "no-config") {
    return (
      <UnavailableScreen
        title="Supabase isn't configured"
        message="This deployment is missing its Supabase environment variables. See SUPABASE_SETUP.md."
      />
    );
  }

  if (authLoading || configState !== "configured" || !user || !scopeInitialized) {
    return <LoadingState message="Opening your palate profile…" />;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <ArchiveLink />
        <AccountNav />
      </div>

      <div>
        <PageHeader
          eyebrow="Private record"
          title="Your palate"
          supporting="A private record of the wines you have tasted, the calls you have made, and the evenings that shaped them."
        />
        <p className="mt-2 text-xs text-cellar-muted">Signed in as {user.email}.</p>
      </div>

      <TastingScopeControl value={scope} onChange={handleScopeChange} saveState={scopeSaveState} />

      {summaryState === "loading" && <p className="text-sm text-cellar-muted">Gathering your record…</p>}
      {summaryState === "unavailable" && (
        <p className="text-sm text-cellar-muted">
          We couldn&rsquo;t reach your palate profile just now. Please try again shortly.
        </p>
      )}

      {summaryState === "ready" && summary && (
        <>
          <section>
            <h2 className="font-display text-2xl font-semibold text-cellar-maroon-dark">At a glance</h2>
            <div className="mt-3">
              <AtAGlanceStrip data={summary.atAGlance} />
            </div>
          </section>

          <BlindPalateSection data={summary.blindPalate} />

          <WineRecordSection data={summary.wineRecord} scope={scope} />

          <TastedWinesLedger scope={scope} />

          <RecentEveningsList evenings={summary.recentEvenings} />
        </>
      )}
    </main>
  );
}
