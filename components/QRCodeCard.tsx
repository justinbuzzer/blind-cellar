"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "./Button";

interface QRCodeCardProps {
  url: string;
  joinCode: string;
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
 * Host Controls' QR/join section. `joinCode` is the existing
 * `tasting_sessions.join_code` value (see README "Session join code") — a
 * stable, non-secret, human-readable identifier for this session's normal
 * public join flow, generated once at session creation and never rotated.
 * It grants only the same access as scanning the QR code above it; it is
 * never a host token, guest rejoin code, or any other credential.
 */
export function QRCodeCard({ url, joinCode }: QRCodeCardProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [codeCopyFallback, setCodeCopyFallback] = useState(false);

  async function handleCopyCode() {
    const ok = await copyText(joinCode);
    if (ok) {
      setCopiedCode(true);
      setCodeCopyFallback(false);
      setTimeout(() => setCopiedCode(false), 1500);
    } else {
      setCodeCopyFallback(true);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="rounded-sm border border-cellar-border bg-white p-4">
        <QRCodeSVG value={url} size={176} fgColor="#24151A" bgColor="#FFFFFF" />
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <p id="join-code-label" className="text-sm font-medium text-cellar-text">
          Join code
        </p>
        <div className="flex items-center gap-2">
          <p
            aria-labelledby="join-code-label"
            aria-label={`Join code: ${joinCode}`}
            className="select-all font-mono text-2xl font-semibold tracking-[0.2em] text-cellar-maroon-dark"
          >
            {joinCode}
          </p>
          <button
            type="button"
            aria-label="Copy join code"
            onClick={handleCopyCode}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm border border-cellar-border px-3 text-sm font-medium text-cellar-maroon transition-colors duration-150 hover:border-cellar-maroon/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
          >
            {copiedCode ? "Copied" : "Copy"}
          </button>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {copiedCode ? "Join code copied." : codeCopyFallback ? "Select and copy the code." : ""}
        </p>
        {codeCopyFallback && (
          <p className="text-xs text-cellar-muted">Select and copy the code.</p>
        )}
      </div>

      <p className="break-all text-xs text-cellar-muted">{url}</p>

      <Button
        type="button"
        variant="secondary"
        fullWidth
        onClick={async () => {
          const ok = await copyText(url);
          if (ok) {
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 1500);
          }
        }}
      >
        {copiedLink ? "Link copied!" : "Copy join link"}
      </Button>
    </div>
  );
}
