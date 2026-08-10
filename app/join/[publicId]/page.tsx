"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { Modal } from "@/components/Modal";
import { HomeLink } from "@/components/navigation/HomeLink";
import { RecoveryCodeEntry } from "@/components/join/RecoveryCodeEntry";
import { RecoveryCodeReveal } from "@/components/join/RecoveryCodeReveal";
import { IdentityChooser } from "@/components/join/IdentityChooser";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { GuestVisibleWineRow, SessionRow } from "@/lib/supabase/types";
import { getGuestToken, setGuestToken } from "@/lib/deviceStorage";
import {
  IdentityMatch,
  JoinResolution,
  deriveJoinScreenState,
  destinationForStatus,
} from "@/lib/rejoin";

type LoadState = "loading" | "no-config" | "not-found" | "ready";
type EntryMode = "default" | "guest-form" | "recovery";

interface PendingGuestJoin {
  guestToken: string;
  recoveryCode: string;
}

interface JoinApiResponse {
  error?: string;
  guestToken?: string;
  recoveryCode?: string;
  accountMatch?: IdentityMatch | null;
  deviceMatch?: IdentityMatch | null;
}

async function fetchJson(
  url: string,
  body: unknown
): Promise<{ data: JoinApiResponse; ok: boolean }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as JoinApiResponse;
    return { data, ok: res.ok && !data.error };
  } catch {
    return { data: { error: "Something went wrong. Please try again." }, ok: false };
  }
}

/**
 * Public join / rejoin landing page — see README "Session rejoin". Identity
 * resolution (account-linked membership, same-device guest cookie, or
 * neither) happens entirely server-side via /api/join/resolve; this
 * component only ever renders one of the five states that produces, plus
 * the guest first-join and recovery-code sub-flows. The pre-existing
 * same-device localStorage guest_token fast path (below) is preserved
 * unchanged for participants who joined before this feature shipped.
 */
export default function JoinSessionPage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();
  const auth = useAuthUser();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [session, setSession] = useState<SessionRow | null>(null);
  const [wines, setWines] = useState<GuestVisibleWineRow[]>([]);
  const [resolution, setResolution] = useState<JoinResolution | null>(null);
  const [entryMode, setEntryMode] = useState<EntryMode>("default");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [pendingGuestJoin, setPendingGuestJoin] = useState<PendingGuestJoin | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const announcedRef = useRef(false);

  async function fetchIdentityMatches(publicId: string) {
    const { data, ok } = await fetchJson("/api/join/resolve", { publicId });
    if (!ok) return { accountMatch: null, deviceMatch: null };
    return {
      accountMatch: (data.accountMatch as IdentityMatch | null) ?? null,
      deviceMatch: (data.deviceMatch as IdentityMatch | null) ?? null,
    };
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }

    (async () => {
      const { data: sessionRow } = await supabase
        .from("tasting_sessions")
        .select(
          "id, public_id, join_code, title, tasting_date, status, created_at, updated_at, tasting_mode, scoring_version"
        )
        .eq("public_id", params.publicId)
        .maybeSingle();

      if (!sessionRow) {
        setLoadState("not-found");
        return;
      }

      // Preserved unchanged: a device that already has a valid guest_token
      // for this session resumes immediately, exactly as before this
      // feature — see README "Session rejoin" for why this fast path is
      // kept alongside the new account/device-cookie resolution below.
      const existingToken = getGuestToken(params.publicId);
      if (existingToken) {
        router.replace(destinationForStatus(sessionRow.status, params.publicId));
        return;
      }

      setSession(sessionRow);

      if (sessionRow.status === "collecting") {
        const { data: winesForSession } = await supabase
          .from("guest_visible_wines")
          .select("*")
          .eq("session_id", sessionRow.id)
          .order("bottle_number", { ascending: true });
        setWines(winesForSession ?? []);
      }

      const identity = await fetchIdentityMatches(params.publicId);
      setResolution({
        session: {
          publicId: sessionRow.public_id,
          status: sessionRow.status,
          tastingMode: sessionRow.tasting_mode,
        },
        accountMatch: identity.accountMatch,
        deviceMatch: identity.deviceMatch,
      });
      setLoadState("ready");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.publicId, router]);

  const screenState = resolution ? deriveJoinScreenState(resolution) : null;

  useEffect(() => {
    if (screenState?.kind === "continue" && !announcedRef.current) {
      announcedRef.current = true;
      setAnnouncement("You have rejoined the tasting.");
    }
    if (screenState?.kind !== "continue") {
      announcedRef.current = false;
    }
  }, [screenState?.kind]);

  async function refreshResolution() {
    if (!session) return;
    const identity = await fetchIdentityMatches(params.publicId);
    setResolution({
      session: {
        publicId: session.public_id,
        status: session.status,
        tastingMode: session.tasting_mode,
      },
      accountMatch: identity.accountMatch,
      deviceMatch: identity.deviceMatch,
    });
  }

  function continueAs(identity: IdentityMatch) {
    if (!session) return;
    setGuestToken(params.publicId, identity.guestToken);
    router.push(destinationForStatus(session.status, params.publicId));
  }

  async function handleGuestJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Enter a display name to join.");
      return;
    }
    if (trimmed.length > 60) {
      setFormError("That name is too long — please shorten it.");
      return;
    }

    setBusy(true);
    const { data, ok } = await fetchJson("/api/join/create", {
      publicId: params.publicId,
      displayName: trimmed,
      asGuest: true,
    });
    setBusy(false);

    if (!ok || !data.guestToken || !data.recoveryCode) {
      setFormError(data.error ?? "Something went wrong. Please try again.");
      return;
    }

    setPendingGuestJoin({ guestToken: data.guestToken, recoveryCode: data.recoveryCode });
  }

  function handleAcknowledgeGuestJoin() {
    if (!pendingGuestJoin || !session) return;
    setGuestToken(params.publicId, pendingGuestJoin.guestToken);
    router.push(destinationForStatus(session.status, params.publicId));
  }

  async function handleContinueWithAccount() {
    if (auth.loading) return;
    if (!auth.user) {
      router.push(`/account/sign-in?redirect=${encodeURIComponent(`/join/${params.publicId}`)}`);
      return;
    }
    setFormError(null);
    setBusy(true);
    const { data, ok } = await fetchJson("/api/join/create", { publicId: params.publicId });
    setBusy(false);

    if (!ok || !session || !data.guestToken) {
      setFormError(data.error ?? "Something went wrong. Please try again.");
      return;
    }
    setGuestToken(params.publicId, data.guestToken);
    router.push(destinationForStatus(session.status, params.publicId));
  }

  async function handleRecoverySubmit(code: string) {
    setRecoveryError(null);
    setBusy(true);
    const { data, ok } = await fetchJson("/api/join/recover", { publicId: params.publicId, code });
    setBusy(false);

    if (!ok || !data.guestToken) {
      setRecoveryError(data.error ?? "That code could not be used. Check it and try again.");
      return;
    }
    if (!session) return;
    setGuestToken(params.publicId, data.guestToken);
    router.push(destinationForStatus(session.status, params.publicId));
  }

  async function handleConfirmClearDevice() {
    setBusy(true);
    await fetchJson("/api/join/clear-device", { publicId: params.publicId });
    setBusy(false);
    setConfirmClearOpen(false);
    await refreshResolution();
  }

  async function handleUseDifferentAccount() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    await refreshResolution();
  }

  if (loadState === "loading") {
    return <LoadingState message="Opening the invitation…" />;
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
        title="This tasting room is unavailable."
        message="This join link doesn't match a tasting. Double-check the link or QR code from your host."
      />
    );
  }

  if (!session || !screenState) return null;

  if (screenState.kind === "revealed") {
    return (
      <UnavailableScreen
        title="This tasting has already been revealed"
        message="New participants can no longer join, but you can still see the results."
        actionHref={`/results/${params.publicId}`}
        actionLabel="View results"
      />
    );
  }

  if (pendingGuestJoin) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
        <RecoveryCodeReveal
          code={pendingGuestJoin.recoveryCode}
          onAcknowledge={handleAcknowledgeGuestJoin}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <HomeLink />

      <div>
        <SectionEyebrow>
          {screenState.kind === "unrecognized" ? "You're invited" : session.title}
        </SectionEyebrow>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-cellar-maroon-dark">
          {screenState.kind === "continue"
            ? `Welcome back, ${screenState.identity.displayName}`
            : screenState.kind === "conflict"
              ? session.title
              : "Join this tasting"}
        </h1>
        {screenState.kind === "unrecognized" && (
          <>
            <p className="mt-1 font-display text-xl text-cellar-maroon-dark">{session.title}</p>
            <p className="mt-2 text-sm text-cellar-muted">
              {new Date(session.tasting_date).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </>
        )}
      </div>

      {screenState.kind === "continue" && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-cellar-text">You already joined this tasting.</p>
          <Button fullWidth onClick={() => continueAs(screenState.identity)}>
            Continue to tasting
          </Button>
          {screenState.via === "account" ? (
            <Button variant="ghost" fullWidth onClick={handleUseDifferentAccount}>
              Use a different identity
            </Button>
          ) : (
            <Button variant="ghost" fullWidth onClick={() => setConfirmClearOpen(true)}>
              This isn&rsquo;t me
            </Button>
          )}
        </Card>
      )}

      {screenState.kind === "conflict" && (
        <IdentityChooser
          account={screenState.account}
          guest={screenState.guest}
          onChooseAccount={() => continueAs(screenState.account)}
          onChooseGuest={() => continueAs(screenState.guest)}
          onUseDifferentAccount={handleUseDifferentAccount}
        />
      )}

      {screenState.kind === "unrecognized" && entryMode === "default" && (
        <>
          {session.status === "registration" && (
            <Card className="text-sm text-cellar-muted">
              Bottle registration is open. Once you join, you can register your
              own bottle before tasting starts.
            </Card>
          )}
          {session.status === "collecting" && (
            <Card className="flex flex-col gap-2">
              <p className="text-sm font-medium text-cellar-text">
                {wines.length} bottles, tasted blind:
              </p>
              <p className="text-sm text-cellar-muted">
                {wines.map((w) => w.anonymous_code).join(", ")}
              </p>
            </Card>
          )}

          <Card className="flex flex-col gap-3">
            {formError && (
              <p role="alert" className="text-xs font-medium text-cellar-danger">
                {formError}
              </p>
            )}
            <Button fullWidth onClick={handleContinueWithAccount} disabled={busy || auth.loading}>
              Continue with my account
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setFormError(null);
                setEntryMode("guest-form");
              }}
              disabled={busy}
            >
              Join as a guest
            </Button>
          </Card>

          <div className="text-center text-sm text-cellar-muted">
            <p>Already joined?</p>
            <button
              type="button"
              className="mt-1 font-medium text-cellar-maroon underline-offset-2 hover:underline"
              onClick={() => {
                setRecoveryError(null);
                setEntryMode("recovery");
              }}
            >
              Enter rejoin code
            </button>
          </div>
        </>
      )}

      {screenState.kind === "unrecognized" && entryMode === "guest-form" && (
        <Card>
          <form onSubmit={handleGuestJoinSubmit} className="flex flex-col gap-4" noValidate>
            <TextField
              label="Display name"
              value={name}
              error={formError ?? undefined}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice"
              maxLength={60}
            />
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button type="submit" fullWidth disabled={busy}>
                {busy ? "Joining…" : "Join tasting"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={() => {
                  setFormError(null);
                  setEntryMode("default");
                }}
                disabled={busy}
              >
                Back
              </Button>
            </div>
          </form>
        </Card>
      )}

      {screenState.kind === "unrecognized" && entryMode === "recovery" && (
        <RecoveryCodeEntry
          onSubmit={handleRecoverySubmit}
          onBack={() => {
            setRecoveryError(null);
            setEntryMode("default");
          }}
          error={recoveryError}
          busy={busy}
        />
      )}

      {confirmClearOpen && (
        <Modal
          title="This isn't me"
          onClose={() => !busy && setConfirmClearOpen(false)}
        >
          <p>
            This clears the saved tasting identity on this browser only. The
            participant record itself isn&rsquo;t deleted — you can still recover
            it later with a rejoin code.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmClearOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmClearDevice} disabled={busy}>
              {busy ? "Clearing…" : "Clear this browser"}
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
