"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { EmptyState } from "@/components/EmptyState";
import { ImageBand } from "@/components/ImageBand";
import { archiveImage } from "@/lib/appImages";
import { HomeLink } from "@/components/navigation/HomeLink";
import { AccountNav } from "@/components/navigation/AccountNav";
import { ProfileLink } from "@/components/navigation/ProfileLink";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { ArchiveTabs } from "@/components/archive/ArchiveTabs";
import { ArchiveEntryRow } from "@/components/archive/ArchiveEntryRow";
import { ArchiveSummaryBar } from "@/components/archive/ArchiveSummaryBar";
import { ClaimPanel } from "@/components/archive/ClaimPanel";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadTastingReportData } from "@/lib/supabase/reportData";
import {
  AccountSessionSummary,
  accountLinkedPublicIds,
  ArchiveEntry,
  ArchiveLookupRequestItem,
  ArchiveLookupResultItem,
  ArchiveTabId,
  buildArchiveSummary,
  defaultArchiveTab,
  MAX_ARCHIVE_LOOKUP_ITEMS,
  resolveAccountEntries,
  selectDisplayEntries,
  splitByRole,
  staleReferences,
} from "@/lib/archive";
import {
  getGuestToken,
  getHostToken,
  listArchiveReferences,
  removeArchiveReference,
} from "@/lib/deviceStorage";
import { AccountTastingRecordRow } from "@/lib/supabase/types";

type BrowserLoadState = "loading" | "unavailable" | "ready";
type AccountLoadState = "idle" | "loading" | "unavailable" | "ready";
type OuterTab = "account" | "browser";

/**
 * The Tasting Archive (see README "Tasting archive" and "Account-linked
 * tasting records"). Two independent sources feed this page:
 *  - the browser archive (unchanged): re-validates each locally-held host/
 *    guest token server-side via POST /api/archive/lookup.
 *  - the account archive (new, signed-in only): reads account_tasting_records
 *    directly — RLS already scopes it to the signed-in user, so no token
 *    round trip is needed to prove ownership, only a revealed-status check
 *    per linked session (see lib/archive.ts's resolveAccountEntries).
 * Neither path can see the other's private data; the only thing that
 * crosses between them is a publicId used to grey out an already-linked
 * "This browser" entry's claim action.
 */
export default function ArchivePage() {
  const { user, loading: authLoading } = useAuthUser();

  const [browserLoadState, setBrowserLoadState] = useState<BrowserLoadState>("loading");
  const [hostedEntries, setHostedEntries] = useState<ArchiveEntry[]>([]);
  const [joinedEntries, setJoinedEntries] = useState<ArchiveEntry[]>([]);
  const [innerTab, setInnerTab] = useState<ArchiveTabId>("joined");

  const [accountLoadState, setAccountLoadState] = useState<AccountLoadState>("idle");
  const [accountEntries, setAccountEntries] = useState<ArchiveEntry[]>([]);

  const [outerTab, setOuterTab] = useState<OuterTab>("account");
  const [outerTabInitialized, setOuterTabInitialized] = useState(false);

  useEffect(() => {
    (async () => {
      // listArchiveReferences() returns oldest-first (see
      // addArchiveReference); take the most-recently-touched
      // MAX_ARCHIVE_LOOKUP_ITEMS so a browser with a long history never
      // exceeds the lookup route's hard per-request cap — sending more than
      // that gets the whole request rejected, not gracefully truncated.
      const references = listArchiveReferences().slice(-MAX_ARCHIVE_LOOKUP_ITEMS);
      const items: ArchiveLookupRequestItem[] = [];
      for (const ref of references) {
        const token = ref.role === "host" ? getHostToken(ref.publicId) : getGuestToken(ref.publicId);
        if (token) items.push({ publicId: ref.publicId, role: ref.role, token });
      }

      if (items.length === 0) {
        setBrowserLoadState("ready");
        return;
      }

      try {
        const response = await fetch("/api/archive/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (!response.ok) {
          setBrowserLoadState("unavailable");
          return;
        }

        const data = (await response.json()) as { items: ArchiveLookupResultItem[] };

        for (const stale of staleReferences(data.items)) {
          removeArchiveReference(stale.publicId, stale.role);
        }

        const { hosted, joined } = splitByRole(selectDisplayEntries(data.items));
        setHostedEntries(hosted);
        setJoinedEntries(joined);
        setInnerTab(defaultArchiveTab(hosted));
        setBrowserLoadState("ready");
      } catch {
        setBrowserLoadState("unavailable");
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) {
      setAccountLoadState("idle");
      setAccountEntries([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setAccountLoadState("loading");
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) setAccountLoadState("unavailable");
        return;
      }

      const { data: records, error } = await supabase
        .from("account_tasting_records")
        .select("session_id, role, participant_id, claimed_at, claim_source");

      if (error) {
        if (!cancelled) setAccountLoadState("unavailable");
        return;
      }

      const entries = await resolveAccountEntries((records ?? []) as AccountTastingRecordRow[], {
        getSessionSummary: async (sessionId) => {
          const { data: sessionRow } = await supabase
            .from("tasting_sessions")
            .select("id, public_id, title, tasting_date, status, tasting_mode, scoring_version, created_at")
            .eq("id", sessionId)
            .maybeSingle();
          if (!sessionRow) return null;

          const [{ count: bottleCount }, { count: participantCount }] = await Promise.all([
            supabase
              .from("wines")
              .select("id", { count: "exact", head: true })
              .eq("session_id", sessionId),
            supabase
              .from("guests")
              .select("id", { count: "exact", head: true })
              .eq("session_id", sessionId),
          ]);

          const summary: AccountSessionSummary = {
            id: sessionRow.id,
            publicId: sessionRow.public_id,
            title: sessionRow.title,
            tastingDate: sessionRow.tasting_date,
            status: sessionRow.status,
            tastingMode: sessionRow.tasting_mode,
            scoringVersion: sessionRow.scoring_version,
            createdAt: sessionRow.created_at,
            bottleCount: bottleCount ?? 0,
            participantCount: participantCount ?? 0,
          };
          return summary;
        },
        loadReport: (session) => loadTastingReportData(supabase, session),
      });

      if (!cancelled) {
        setAccountEntries(entries);
        setAccountLoadState("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Lets "Back to your record" on the results page deep-link to the right
  // outer tab — read once, after mount, matching this app's established
  // manual-query-param pattern (avoids useSearchParams' Suspense
  // requirement for what's otherwise a fully client-rendered page).
  useEffect(() => {
    if (outerTabInitialized) return;
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "browser" || requested === "account") {
      setOuterTab(requested);
    }
    setOuterTabInitialized(true);
  }, [outerTabInitialized]);

  if (browserLoadState === "loading" || authLoading) {
    return <LoadingState message="Gathering the evening's notes…" />;
  }

  if (browserLoadState === "unavailable") {
    return (
      <UnavailableScreen
        title="The archive is unavailable"
        message="We couldn't reach the tasting server just now. Please try again shortly."
      />
    );
  }

  const linkedPublicIds = accountLinkedPublicIds(accountEntries);
  const activeInnerEntries = innerTab === "hosted" ? hostedEntries : joinedEntries;
  const innerSummary = buildArchiveSummary(activeInnerEntries);
  const accountSummary = buildArchiveSummary(accountEntries);

  function claimActionFor(entry: ArchiveEntry) {
    if (!user) return undefined;
    if (linkedPublicIds.has(entry.publicId)) {
      return <p className="text-xs text-cellar-muted">Already in your record</p>;
    }
    const token = entry.role === "host" ? getHostToken(entry.publicId) : getGuestToken(entry.publicId);
    if (!token) return undefined;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-cellar-muted">Available on this browser only</p>
        <ClaimPanel
          publicId={entry.publicId}
          role={entry.role}
          token={token}
          onClaimed={() => setAccountEntries((prev) => [...prev, entry])}
        />
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <ProfileLink />
        <AccountNav />
      </div>

      <div>
        <SectionEyebrow>Private record</SectionEyebrow>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-cellar-maroon-dark">
          The tasting archive
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-cellar-muted">
          A record of bottles, impressions, and evenings at the table.
        </p>
        <p className="mt-4 text-xs text-cellar-muted">
          Your archive is available on this browser. Account-based access and
          cross-device history may be added later.
        </p>
        {user ? (
          <p className="mt-1 text-xs text-cellar-muted">
            Signed in as {user.email}. Browser-linked tasting records remain
            available on this device.
          </p>
        ) : (
          <p className="mt-1 text-xs text-cellar-muted">
            Sign in to keep future tasting records across devices.
          </p>
        )}
      </div>

      <ImageBand image={archiveImage} className="hidden h-36 rounded-sm sm:block" />

      {user && (
        <ArchiveTabs
          idPrefix="record"
          label="Your tasting records"
          options={[
            { id: "account", label: "Your record" },
            { id: "browser", label: "This browser" },
          ]}
          selected={outerTab}
          onChange={setOuterTab}
        />
      )}

      {(!user || outerTab === "browser") && (
        <div
          role={user ? "tabpanel" : undefined}
          id={user ? "record-panel-browser" : undefined}
          aria-labelledby={user ? "record-tab-browser" : undefined}
          className="flex flex-col gap-6"
        >
          <ArchiveTabs
            idPrefix="archive"
            options={[
              { id: "hosted", label: "Hosted by you", count: hostedEntries.length },
              { id: "joined", label: "Joined by you", count: joinedEntries.length },
            ]}
            selected={innerTab}
            onChange={setInnerTab}
          />

          <div
            role="tabpanel"
            id={`archive-panel-${innerTab}`}
            aria-labelledby={`archive-tab-${innerTab}`}
            className="flex flex-col gap-6"
          >
            {activeInnerEntries.length > 0 && <ArchiveSummaryBar summary={innerSummary} />}

            {activeInnerEntries.length === 0 ? (
              innerTab === "hosted" ? (
                <EmptyState
                  title="No hosted tastings here yet."
                  message="Create a private tasting, gather your table, and the finished report will be kept here on this browser."
                  action={
                    <Link href="/host/new">
                      <Button>Host a tasting</Button>
                    </Link>
                  }
                />
              ) : (
                <EmptyState
                  title="No joined tastings here yet."
                  message="Join a tasting with your host's private code. Once the tasting is complete, its report will appear here on this browser."
                  action={
                    <Link href="/join">
                      <Button>Join a tasting</Button>
                    </Link>
                  }
                />
              )
            ) : (
              <ul className="divide-y divide-cellar-border">
                {activeInnerEntries.map((entry) => (
                  <ArchiveEntryRow
                    key={`${entry.role}-${entry.publicId}`}
                    entry={entry}
                    reportContext="archive"
                    action={claimActionFor(entry)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {user && outerTab === "account" && (
        <div
          role="tabpanel"
          id="record-panel-account"
          aria-labelledby="record-tab-account"
          className="flex flex-col gap-6"
        >
          {accountLoadState === "loading" && (
            <p className="text-sm text-cellar-muted">Gathering your record…</p>
          )}
          {accountLoadState === "unavailable" && (
            <p className="text-sm text-cellar-muted">
              We couldn&rsquo;t reach your account record just now. Please try again shortly.
            </p>
          )}
          {accountLoadState === "ready" && (
            <>
              {accountEntries.length > 0 && <ArchiveSummaryBar summary={accountSummary} />}
              {accountEntries.length === 0 ? (
                <EmptyState
                  title="Your record is waiting."
                  message="Future tastings you host or join while signed in will appear here. You can also add eligible completed tastings from the browser where you joined them."
                  action={
                    <div className="flex flex-col items-center gap-2">
                      <Link href="/">
                        <Button>Return home</Button>
                      </Link>
                      <button
                        type="button"
                        onClick={() => setOuterTab("browser")}
                        className="min-h-[44px] text-sm font-medium text-cellar-maroon underline-offset-4 hover:text-cellar-maroon-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
                      >
                        View this browser&rsquo;s archive
                      </button>
                    </div>
                  }
                />
              ) : (
                <ul className="divide-y divide-cellar-border">
                  {accountEntries.map((entry) => (
                    <ArchiveEntryRow
                      key={`${entry.role}-${entry.publicId}`}
                      entry={entry}
                      reportContext="account"
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
