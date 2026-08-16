"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionEyebrow } from "@/components/SectionEyebrow";

interface RecoveryCodeRevealProps {
  code: string;
  onAcknowledge: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The one-time "You're in" confirmation shown right after a new guest joins
 * — see README "Session rejoin" — "Guest first-join flow". Deliberately has
 * no aria-live region for the code itself: it must never be announced
 * automatically, only read if the user navigates to it. `select-all` keeps
 * manual selection easy; the Copy button reuses the exact same
 * copy-to-clipboard/fallback pattern as the join-code card in Host Controls
 * (see QRCodeCard.tsx) so a user who can't easily select text on their
 * device (or is on mobile, where select-and-copy is fiddly) still has a
 * reliable way to save the code.
 */
export function RecoveryCodeReveal({ code, onAcknowledge }: RecoveryCodeRevealProps) {
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);

  async function handleCopy() {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      setCopyFallback(false);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setCopyFallback(true);
    }
  }

  return (
    <Card className="flex flex-col gap-4 text-center">
      <div>
        <SectionEyebrow>You&rsquo;re in</SectionEyebrow>
        <p className="mt-2 text-sm text-cellar-text">
          Save this rejoin code in case you change devices or clear your browser:
        </p>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <p
            className="select-all rounded-sm border border-cellar-border bg-cellar-bg-deep py-4 pl-5 pr-4 font-mono text-2xl font-semibold tracking-[0.2em] text-cellar-maroon-dark"
            aria-label={`Your rejoin code is ${code}`}
          >
            {code}
          </p>
          <button
            type="button"
            aria-label="Copy rejoin code"
            onClick={handleCopy}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm border border-cellar-border px-3 text-sm font-medium text-cellar-maroon transition-colors duration-150 hover:border-cellar-maroon/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {copied ? "Rejoin code copied." : copyFallback ? "Select and copy the code." : ""}
        </p>
        {copyFallback && (
          <p className="text-xs text-cellar-muted">Select and copy the code.</p>
        )}
      </div>
      <p className="text-xs text-cellar-muted">
        This code can restore your tasting access on another device.
      </p>
      <Button fullWidth onClick={onAcknowledge}>
        I&rsquo;ve saved it
      </Button>
    </Card>
  );
}
