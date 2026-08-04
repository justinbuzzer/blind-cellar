"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { HomeLink } from "@/components/navigation/HomeLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { joinSession } from "@/lib/supabase/guestActions";
import { friendlyRpcError, GuestVisibleWineRow, SessionRow } from "@/lib/supabase/types";
import { getGuestToken, setGuestToken } from "@/lib/deviceStorage";
import { SessionStatus } from "@/types/tasting";

type LoadState = "loading" | "no-config" | "not-found" | "revealed" | "ready";

function destinationForStatus(status: SessionStatus, publicId: string): string {
  if (status === "registration") return `/register/${publicId}`;
  if (status === "collecting") return `/tasting/${publicId}`;
  return `/results/${publicId}`;
}

export default function JoinSessionPage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [session, setSession] = useState<SessionRow | null>(null);
  const [wines, setWines] = useState<GuestVisibleWineRow[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }

    (async () => {
      const { data: sessionRow } = await supabase
        .from("tasting_sessions")
        .select("id, public_id, join_code, title, tasting_date, status, created_at, updated_at")
        .eq("public_id", params.publicId)
        .maybeSingle();

      if (!sessionRow) {
        setLoadState("not-found");
        return;
      }

      const existingToken = getGuestToken(params.publicId);
      if (existingToken) {
        router.replace(destinationForStatus(sessionRow.status, params.publicId));
        return;
      }

      if (sessionRow.status === "revealed") {
        setLoadState("revealed");
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

      setLoadState("ready");
    })();
  }, [params.publicId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a display name to join.");
      return;
    }
    if (trimmed.length > 60) {
      setError("That name is too long — please shorten it.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session) {
      setError("Supabase isn't configured for this app yet.");
      return;
    }

    setJoining(true);
    const { data, error: joinError } = await joinSession(supabase, params.publicId, trimmed);
    setJoining(false);

    if (joinError || !data) {
      setError(friendlyRpcError(joinError));
      return;
    }

    setGuestToken(params.publicId, data.guest_token);
    router.push(destinationForStatus(session.status, params.publicId));
  }

  if (loadState === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6">
        <p className="text-sm text-cellar-text/60">Loading tasting…</p>
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
        message="This join link doesn't match a tasting. Double-check the link or QR code from your host."
      />
    );
  }

  if (loadState === "revealed") {
    return (
      <UnavailableScreen
        title="This tasting has already been revealed"
        message="New participants can no longer join, but you can still see the results."
        actionHref={`/results/${params.publicId}`}
        actionLabel="View results"
      />
    );
  }

  if (!session) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <HomeLink />
      <div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">
          {session.title}
        </h1>
        <p className="mt-1 text-sm text-cellar-text/70">
          {new Date(session.tasting_date).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {session.status === "registration" && (
        <Card className="text-sm text-cellar-text/70">
          Bottle registration is open. Once you join, you can register your
          own bottle before tasting starts.
        </Card>
      )}

      {session.status === "collecting" && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm font-medium text-cellar-text">
            {wines.length} bottles, tasted blind:
          </p>
          <p className="text-sm text-cellar-text/70">
            {wines.map((w) => w.anonymous_code).join(", ")}
          </p>
        </Card>
      )}

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Display name"
            value={name}
            error={error ?? undefined}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alice"
            maxLength={60}
          />
          <Button type="submit" fullWidth disabled={joining}>
            {joining ? "Joining…" : "Join tasting"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

function UnavailableScreen({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <HomeLink />
      <h1 className="text-xl font-semibold text-cellar-maroon-dark">{title}</h1>
      <p className="text-sm text-cellar-text/70">{message}</p>
      {actionHref && actionLabel && (
        <a href={actionHref}>
          <Button>{actionLabel}</Button>
        </a>
      )}
    </main>
  );
}
