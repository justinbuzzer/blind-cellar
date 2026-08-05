"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
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

      <PageHeader
        title="Join the table"
        supporting="Enter the private code shared by your host."
      />

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="join-code" className="text-sm font-medium text-cellar-text">
              Session code
            </label>
            <input
              id="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="MAROON-42"
              autoCapitalize="characters"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "join-code-error" : undefined}
              className={`rounded-sm border bg-white px-4 py-3 text-center font-display text-2xl uppercase tracking-[0.15em] text-cellar-maroon-dark placeholder:text-cellar-text/30 focus:outline-none focus:ring-2 focus:ring-cellar-gold ${
                error ? "border-cellar-danger" : "border-cellar-border"
              }`}
            />
            {error && (
              <p id="join-code-error" role="alert" className="text-xs font-medium text-cellar-danger">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" fullWidth disabled={checking}>
            {checking ? "Looking up tasting…" : "Join tasting"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
