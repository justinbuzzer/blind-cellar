"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { PageHeader } from "@/components/PageHeader";
import { StatusChip } from "@/components/StatusChip";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { sanitizeDisplayName } from "@/lib/supabase/auth";

type LoadState = "loading" | "no-config" | "signed-out" | "ready" | "signed-out-confirm";

/**
 * The minimal signed-in account page (see README "Accounts"). Deliberately
 * has no avatar, no password controls, no data export, and no delete-account
 * flow in this phase — see the completion report for why delete-account was
 * left out. Profile updates go straight through Postgres RLS
 * (`profiles_update_own`, column-limited to display_name), the same
 * direct-client pattern the rest of this app already uses for
 * participant-owned data — no server route needed.
 */
export default function AccountPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }

    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/account/sign-in?redirect=/account");
        setLoadState("signed-out");
        return;
      }

      setEmail(user.email ?? "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      const existingName = profile?.display_name ?? "";
      setDisplayName(existingName);
      setSavedName(existingName);
      setLoadState("ready");
    })();
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSaving(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setSaving(false);
      router.replace("/account/sign-in?redirect=/account");
      return;
    }

    const cleaned = sanitizeDisplayName(displayName);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: cleaned })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      setSaveError("We couldn't save that just now. Please try again.");
      return;
    }

    setDisplayName(cleaned ?? "");
    setSavedName(cleaned);
    setSaveMessage("Saved.");
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setLoadState("signed-out-confirm");
    setTimeout(() => router.push("/"), 1200);
  }

  if (loadState === "loading" || loadState === "signed-out") {
    return <LoadingState message="Opening your tasting record…" />;
  }

  if (loadState === "no-config") {
    return (
      <UnavailableScreen
        title="Supabase isn't configured"
        message="This deployment is missing its Supabase environment variables. See SUPABASE_SETUP.md."
      />
    );
  }

  if (loadState === "signed-out-confirm") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <p role="status" aria-live="polite" className="font-display text-2xl font-semibold text-cellar-maroon-dark">
          You have signed out.
        </p>
        <p className="text-sm text-cellar-muted">Taking you home…</p>
      </main>
    );
  }

  const hasUnsavedChanges = displayName.trim() !== (savedName ?? "");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <HomeLink confirmBeforeLeave hasUnsavedChanges={hasUnsavedChanges} />

      <PageHeader
        eyebrow="Private record"
        title="Your tasting record"
        supporting="Your account keeps future tasting records available across devices."
        action={<StatusChip tone="success">Signed in</StatusChip>}
      />

      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-cellar-text">Email address</p>
          <p className="mt-0.5 text-sm text-cellar-muted">{email}</p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4 border-t border-cellar-border pt-4">
          <TextField
            label="Name for your account"
            hint="This is separate from the display name you use at individual tasting tables."
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSaveMessage(null);
            }}
            maxLength={60}
            placeholder="Optional"
          />

          {saveMessage && (
            <p role="status" aria-live="polite" className="text-sm font-medium text-cellar-success">
              {saveMessage}
            </p>
          )}
          {saveError && (
            <p role="alert" className="rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger">
              {saveError}
            </p>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save details"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-2">
        <Link href="/account/tastings">
          <Button variant="secondary" fullWidth>
            My tastings
          </Button>
        </Link>
        <Link href="/profile">
          <Button variant="secondary" fullWidth>
            Your palate
          </Button>
        </Link>
        <Link href="/cellar">
          <Button variant="secondary" fullWidth>
            My cellar
          </Button>
        </Link>
        <Link href="/archive">
          <Button variant="secondary" fullWidth>
            View tasting archive
          </Button>
        </Link>
        <Button variant="ghost" fullWidth onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </main>
  );
}
