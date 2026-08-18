"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { HomeLink } from "@/components/navigation/HomeLink";
import { RecoveryCodeEntry } from "@/components/join/RecoveryCodeEntry";
import { setGuestToken } from "@/lib/deviceStorage";
import { destinationForStatus } from "@/lib/rejoin";
import { SessionStatus } from "@/types/tasting";

interface RejoinApiResponse {
  error?: string;
  guestToken?: string;
  publicId?: string;
  status?: SessionStatus;
}

/**
 * Home-page "Rejoin a tasting" entry point — see README "Session rejoin".
 * Unlike the recovery-code flow nested inside /join/[publicId], this page
 * needs no publicId up front: it exists specifically for a guest who has
 * lost their device's saved identity (localStorage wiped, new device, etc.)
 * and doesn't know or remember which tasting URL to go back to — only their
 * personal rejoin code. Reuses RecoveryCodeEntry unchanged; the only new
 * piece is /api/rejoin, which resolves the session from the code itself.
 */
export default function RejoinPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(code: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/rejoin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as RejoinApiResponse;
      setBusy(false);

      if (!res.ok || !data.guestToken || !data.publicId || !data.status) {
        setError(data.error ?? "That code could not be used. Check it and try again.");
        return;
      }
      setGuestToken(data.publicId, data.guestToken);
      router.push(destinationForStatus(data.status, data.publicId));
    } catch {
      setBusy(false);
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <HomeLink />
      <div>
        <SectionEyebrow>Rejoin a tasting</SectionEyebrow>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-cellar-maroon-dark">
          Lost your place?
        </h1>
        <p className="mt-2 text-sm text-cellar-muted">
          Enter the rejoin code you saved when you first joined to get back into that tasting.
        </p>
      </div>
      <RecoveryCodeEntry
        onSubmit={handleSubmit}
        onBack={() => router.push("/")}
        error={error}
        busy={busy}
      />
    </main>
  );
}
