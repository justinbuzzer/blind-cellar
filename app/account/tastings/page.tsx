"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { PageHeader } from "@/components/PageHeader";
import { StatusChip } from "@/components/StatusChip";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getHostToken } from "@/lib/deviceStorage";
import { buildHostControlsHref } from "@/lib/hostControlsLink";
import { MyTastingEntry } from "@/lib/supabase/types";
import { TASTING_MODE_LABELS } from "@/types/tasting";

type LoadState = "loading" | "no-config" | "signed-out" | "ready" | "error";

/**
 * "My tastings" (see README "Session rejoin" — "Resume from account area").
 * Minimally extends the existing account area rather than a new dashboard —
 * a single RPC (get_my_tastings), safe fields only, scoped to auth.uid().
 *
 * Host resume deliberately stays token-based, unchanged: this page can only
 * offer a working "Resume tasting" for a hosted session when the CURRENT
 * browser still holds that session's host_token in localStorage (the
 * pre-existing host-token model was never account-linked and this feature
 * does not attempt to fix lost-host-token recovery — see README for why
 * that is a deliberate, documented deferral). Participant resume always
 * works from any signed-in device, since guests.user_id (not a local token)
 * is the proof of identity there.
 */
export default function MyTastingsPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [entries, setEntries] = useState<MyTastingEntry[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }

    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/account/sign-in?redirect=/account/tastings");
        setLoadState("signed-out");
        return;
      }

      const { data, error } = await supabase.rpc("get_my_tastings");
      if (error) {
        setLoadState("error");
        return;
      }
      setEntries((data as MyTastingEntry[] | null) ?? []);
      setLoadState("ready");
    })();
  }, [router]);

  if (loadState === "loading" || loadState === "signed-out") {
    return <LoadingState message="Opening your tastings…" />;
  }

  if (loadState === "no-config") {
    return (
      <UnavailableScreen
        title="Supabase isn't configured"
        message="This deployment is missing its Supabase environment variables. See SUPABASE_SETUP.md."
      />
    );
  }

  if (loadState === "error") {
    return (
      <UnavailableScreen
        title="We couldn't load your tastings"
        message="Something went wrong talking to the tasting server. Please try again."
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <HomeLink />
      <PageHeader
        eyebrow="Private record"
        title="My tastings"
        supporting="Tastings you host or have joined with this account."
      />

      {entries.length === 0 ? (
        <Card className="text-sm text-cellar-muted">
          No tastings yet. Sessions you host or join while signed in will
          appear here.
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={`${entry.role}-${entry.publicId}`}>
              <TastingRow entry={entry} />
            </li>
          ))}
        </ul>
      )}

      <Link href="/account">
        <Button variant="ghost" fullWidth>
          Back to your account
        </Button>
      </Link>
    </main>
  );
}

function TastingRow({ entry }: { entry: MyTastingEntry }) {
  const hostToken = entry.role === "host" ? getHostToken(entry.publicId) : null;
  const dateLabel = new Date(entry.tastingDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-cellar-maroon-dark">
            {entry.title}
          </h2>
          <p className="text-sm text-cellar-muted">
            {dateLabel} · {TASTING_MODE_LABELS[entry.tastingMode]}
          </p>
        </div>
        <StatusChip tone={entry.role === "host" ? "active" : "neutral"}>
          {entry.role === "host" ? "Host" : "Participant"}
        </StatusChip>
      </div>

      {entry.role === "participant" && (
        <Link href={`/join/${entry.publicId}`}>
          <Button fullWidth>Resume tasting</Button>
        </Link>
      )}

      {entry.role === "host" &&
        (hostToken ? (
          <Link href={buildHostControlsHref(entry.publicId, hostToken)}>
            <Button fullWidth>Resume tasting</Button>
          </Link>
        ) : (
          <p className="text-xs text-cellar-muted">
            Host access for this tasting requires the original device or saved
            host link.
          </p>
        ))}
    </Card>
  );
}
