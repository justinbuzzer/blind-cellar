"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { AccountNav } from "@/components/navigation/AccountNav";
import { ArchiveTabs } from "@/components/archive/ArchiveTabs";
import { CellarEntryRow, CellarSessionSummary } from "@/components/cellar/CellarEntryRow";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { markCellarBottleConsumed, returnCellarBottleToAvailable } from "@/lib/supabase/cellarActions";
import { CellarBottleRow, friendlyRpcError } from "@/lib/supabase/types";
import { CellarBottleStatus } from "@/types/tasting";

type ConfigState = "checking" | "no-config" | "configured";
type LoadState = "loading" | "ready" | "error";

const CELLAR_ROW_LIMIT = 300;

const TAB_OPTIONS: { id: CellarBottleStatus; label: string }[] = [
  { id: "available", label: "Available" },
  { id: "reserved", label: "Reserved" },
  { id: "consumed", label: "Consumed" },
];

export default function CellarPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();

  const [configState, setConfigState] = useState<ConfigState>("checking");
  const [tab, setTab] = useState<CellarBottleStatus>("available");
  const [tabInitialized, setTabInitialized] = useState(false);
  const [showAdded, setShowAdded] = useState(false);

  const [rows, setRows] = useState<CellarBottleRow[]>([]);
  const [sessionById, setSessionById] = useState<Map<string, CellarSessionSummary>>(new Map());
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const [returnTarget, setReturnTarget] = useState<CellarBottleRow | null>(null);
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  const [consumeTarget, setConsumeTarget] = useState<CellarBottleRow | null>(null);
  const [consuming, setConsuming] = useState(false);
  const [consumeError, setConsumeError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    setConfigState(supabase ? "configured" : "no-config");
  }, []);

  useEffect(() => {
    if (authLoading || configState !== "configured" || user) return;
    router.replace("/account/sign-in?redirect=/cellar");
  }, [authLoading, configState, user, router]);

  // Read `?tab=`/`?added=` once on mount (see README "Palate Profile" for
  // why this app always reads query state manually rather than via
  // next/navigation's useSearchParams on fully client-rendered pages), then
  // strip `added` so a reload never re-shows the confirmation.
  useEffect(() => {
    if (tabInitialized) return;
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (requestedTab === "available" || requestedTab === "reserved" || requestedTab === "consumed") {
      setTab(requestedTab);
    }
    if (params.get("added") === "1") {
      setShowAdded(true);
      router.replace(requestedTab ? `/cellar?tab=${requestedTab}` : "/cellar");
    }
    setTabInitialized(true);
  }, [tabInitialized, router]);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setLoadState("loading");
    const { data, error } = await supabase
      .from("cellar_bottles")
      .select("*")
      .eq("status", tab)
      .order("created_at", { ascending: false })
      .limit(CELLAR_ROW_LIMIT);

    if (error || !data) {
      setLoadState("error");
      return;
    }
    const cellarRows = data as CellarBottleRow[];
    setRows(cellarRows);

    const sessionIds = Array.from(
      new Set(
        cellarRows
          .map((r) => (tab === "consumed" ? r.consumed_session_id : r.reserved_session_id))
          .filter((id): id is string => Boolean(id))
      )
    );

    if (sessionIds.length > 0) {
      const { data: sessionRows } = await supabase
        .from("tasting_sessions")
        .select("id, public_id, title, tasting_date, status")
        .in("id", sessionIds);
      const map = new Map<string, CellarSessionSummary>(
        (sessionRows ?? []).map((s) => [
          s.id,
          { publicId: s.public_id, title: s.title, tastingDate: s.tasting_date, status: s.status },
        ])
      );
      setSessionById(map);
    } else {
      setSessionById(new Map());
    }

    setLoadState("ready");
  }, [tab]);

  useEffect(() => {
    if (tabInitialized && user) refresh();
  }, [tabInitialized, user, refresh]);

  async function handleReturn() {
    if (!returnTarget) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setReturning(true);
    setReturnError(null);
    const { error } = await returnCellarBottleToAvailable(supabase, returnTarget.id);
    setReturning(false);

    if (error) {
      setReturnError(friendlyRpcError(error));
      return;
    }
    setReturnTarget(null);
    await refresh();
  }

  async function handleConsume() {
    if (!consumeTarget) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setConsuming(true);
    setConsumeError(null);
    const { error } = await markCellarBottleConsumed(supabase, consumeTarget.id);
    setConsuming(false);

    if (error) {
      setConsumeError(friendlyRpcError(error));
      return;
    }
    setConsumeTarget(null);
    await refresh();
  }

  if (configState === "no-config") {
    return (
      <UnavailableScreen
        title="Supabase isn't configured"
        message="This deployment is missing its Supabase environment variables. See SUPABASE_SETUP.md."
      />
    );
  }

  if (authLoading || configState !== "configured" || !user || !tabInitialized) {
    return <LoadingState message="Opening your cellar…" />;
  }

  const sessionFor = (row: CellarBottleRow): CellarSessionSummary | null => {
    const sessionId = tab === "consumed" ? row.consumed_session_id : row.reserved_session_id;
    return sessionId ? (sessionById.get(sessionId) ?? null) : null;
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <AccountNav />
      </div>

      <div>
        <PageHeader
          eyebrow="Private cellar"
          title="My cellar"
          supporting="A private record of the bottles you have on hand."
          action={
            <Link href="/cellar/new">
              <Button>Add a bottle</Button>
            </Link>
          }
        />
        {showAdded && (
          <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-cellar-success">
            Bottle added to your cellar.
          </p>
        )}
      </div>

      <ArchiveTabs
        idPrefix="cellar"
        label="Cellar status"
        options={TAB_OPTIONS}
        selected={tab}
        onChange={setTab}
      />

      <div
        role="tabpanel"
        id={`cellar-panel-${tab}`}
        aria-labelledby={`cellar-tab-${tab}`}
        className="flex flex-col gap-4"
      >
        {loadState === "loading" && <p className="text-sm text-cellar-muted">Gathering your cellar…</p>}
        {loadState === "error" && (
          <p className="text-sm text-cellar-muted">
            We couldn&rsquo;t reach your cellar just now. Please try again shortly.
          </p>
        )}

        {loadState === "ready" && rows.length === 0 && (
          <>
            {tab === "available" && (
              <EmptyState
                title="Your cellar is ready."
                message="Add bottles you have on hand, then select one when you join a tasting."
                action={
                  <Link href="/cellar/new">
                    <Button>Add a bottle</Button>
                  </Link>
                }
              />
            )}
            {tab === "reserved" && (
              <EmptyState
                title="No bottles are reserved."
                message="Bottles selected for an upcoming tasting will appear here."
              />
            )}
            {tab === "consumed" && (
              <EmptyState
                title="No bottles have been consumed from your cellar."
                message="Bottles used in a tasting will remain here as part of your cellar record."
              />
            )}
          </>
        )}

        {loadState === "ready" && rows.length > 0 && (
          <ul className="divide-y divide-cellar-border">
            {rows.map((row) => (
              <CellarEntryRow
                key={row.id}
                row={row}
                session={sessionFor(row)}
                onEdit={tab === "available" ? () => router.push(`/cellar/${row.id}/edit`) : undefined}
                onReturn={
                  tab === "reserved"
                    ? () => {
                        setReturnError(null);
                        setReturnTarget(row);
                      }
                    : undefined
                }
                onConsume={
                  tab === "reserved"
                    ? () => {
                        setConsumeError(null);
                        setConsumeTarget(row);
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>

      {returnTarget && (
        <Modal title="Return this bottle to your cellar?" onClose={() => !returning && setReturnTarget(null)}>
          <p>The bottle will become available again and will no longer be linked to this tasting.</p>
          {returnError && (
            <p role="alert" className="mt-2 text-sm text-cellar-danger">
              {returnError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReturnTarget(null)} disabled={returning}>
              Cancel
            </Button>
            <Button onClick={handleReturn} disabled={returning}>
              {returning ? "Returning…" : "Return to cellar"}
            </Button>
          </div>
        </Modal>
      )}

      {consumeTarget && (
        <Modal title="Mark this bottle as consumed?" onClose={() => !consuming && setConsumeTarget(null)}>
          <p>This will move the bottle to your consumed cellar record and link it to this tasting.</p>
          {consumeError && (
            <p role="alert" className="mt-2 text-sm text-cellar-danger">
              {consumeError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConsumeTarget(null)} disabled={consuming}>
              Cancel
            </Button>
            <Button onClick={handleConsume} disabled={consuming}>
              {consuming ? "Saving…" : "Mark as consumed"}
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
