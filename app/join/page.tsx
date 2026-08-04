"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { HomeLink } from "@/components/navigation/HomeLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function JoinLandingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      setError("Enter the session code your host gave you.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError(
        "Supabase isn't configured for this app yet. See SUPABASE_SETUP.md."
      );
      return;
    }

    setChecking(true);
    const { data, error: queryError } = await supabase
      .from("tasting_sessions")
      .select("public_id")
      .eq("join_code", trimmedCode)
      .maybeSingle();
    setChecking(false);

    if (queryError) {
      setError("Couldn't reach the tasting server. Please try again.");
      return;
    }
    if (!data) {
      setError(
        `We couldn't find a tasting with the code "${trimmedCode}". Double-check it with your host.`
      );
      return;
    }

    router.push(`/join/${data.public_id}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <HomeLink />
      <div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">
          Join a tasting
        </h1>
        <p className="mt-1 text-sm text-cellar-text/70">
          Enter the session code your host gave you, or scan their QR code
          instead.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Session code"
            value={code}
            error={error ?? undefined}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. MAROON-42"
            autoCapitalize="characters"
          />
          <Button type="submit" fullWidth disabled={checking}>
            {checking ? "Looking up tasting…" : "Find tasting"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
