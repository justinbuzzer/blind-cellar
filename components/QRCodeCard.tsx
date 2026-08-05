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

export function QRCodeCard({ url, joinCode }: QRCodeCardProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="rounded-sm border border-cellar-border bg-white p-4">
        <QRCodeSVG value={url} size={176} fgColor="#24151A" bgColor="#FFFFFF" />
      </div>
      <p className="break-all text-xs text-cellar-muted">{url}</p>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
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
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={async () => {
            const ok = await copyText(joinCode);
            if (ok) {
              setCopiedCode(true);
              setTimeout(() => setCopiedCode(false), 1500);
            }
          }}
        >
          {copiedCode ? "Code copied!" : "Copy join code"}
        </Button>
      </div>
    </div>
  );
}
