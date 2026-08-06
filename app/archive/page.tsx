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
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { ArchiveTabs } from "@/components/archive/ArchiveTabs";
import { ArchiveEntryRow } from "@/components/archive/ArchiveEntryRow";
import { ArchiveSummaryBar } from "@/components/archive/ArchiveSummaryBar";
import {
  ArchiveEntry,
  ArchiveLookupRequestItem,
  ArchiveLookupResultItem,
  ArchiveTabId,
  buildArchiveSummary,
  defaultArchiveTab,
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

type LoadState = "loading" | "unavailable" | "ready";

/**
 * The Tasting Archive (see README "Tasting archive") — a private, read-only
 * ledger of completed tastings this exact browser has a host or participant
 * token for. Nothing here is fetched from a global "all revealed sessions"
 * list; every entry comes back from POST /api/archive/lookup, which
 * re-validates each local reference's token server-side before returning
 * anything about it (see lib/archive.ts).
 */
export default function ArchivePage() {
  const { user } = useAuthUser();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [hostedEntries, setHostedEntries] = useState<ArchiveEntry[]>([]);
  const [joinedEntries, setJoinedEntries] = useState<ArchiveEntry[]>([]);
  const [selectedTab, setSelectedTab] = useState<ArchiveTabId>("joined");

  useEffect(() => {
    (async () => {
      const references = listArchiveReferences();
      const items: ArchiveLookupRequestItem[] = [];
      for (const ref of references) {
        const token = ref.role === "host" ? getHostToken(ref.publicId) : getGuestToken(ref.publicId);
        if (token) items.push({ publicId: ref.publicId, role: ref.role, token });
      }

      if (items.length === 0) {
        setLoadState("ready");
        return;
      }

      try {
        const response = await fetch("/api/archive/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (!response.ok) {
          setLoadState("unavailable");
          return;
        }

        const data = (await response.json()) as { items: ArchiveLookupResultItem[] };

        for (const stale of staleReferences(data.items)) {
          removeArchiveReference(stale.publicId, stale.role);
        }

        const { hosted, joined } = splitByRole(selectDisplayEntries(data.items));
        setHostedEntries(hosted);
        setJoinedEntries(joined);
        setSelectedTab(defaultArchiveTab(hosted));
        setLoadState("ready");
      } catch {
        setLoadState("unavailable");
      }
    })();
  }, []);

  if (loadState === "loading") {
    return <LoadingState message="Gathering the evening's notes…" />;
  }

  if (loadState === "unavailable") {
    return (
      <UnavailableScreen
        title="The archive is unavailable"
        message="We couldn't reach the tasting server just now. Please try again shortly."
      />
    );
  }

  const activeEntries = selectedTab === "hosted" ? hostedEntries : joinedEntries;
  const summary = buildArchiveSummary(activeEntries);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
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
        {user && (
          <p className="mt-1 text-xs text-cellar-muted">
            Signed in as {user.email}. Browser-linked tasting records remain
            available on this device.
          </p>
        )}
      </div>

      <ImageBand image={archiveImage} className="hidden h-36 rounded-sm sm:block" />

      <ArchiveTabs
        options={[
          { id: "hosted", label: "Hosted by you", count: hostedEntries.length },
          { id: "joined", label: "Joined by you", count: joinedEntries.length },
        ]}
        selected={selectedTab}
        onChange={setSelectedTab}
      />

      <div
        role="tabpanel"
        id={`archive-panel-${selectedTab}`}
        aria-labelledby={`archive-tab-${selectedTab}`}
        className="flex flex-col gap-6"
      >
        {activeEntries.length > 0 && <ArchiveSummaryBar summary={summary} />}

        {activeEntries.length === 0 ? (
          selectedTab === "hosted" ? (
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
            {activeEntries.map((entry) => (
              <ArchiveEntryRow key={`${entry.role}-${entry.publicId}`} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
