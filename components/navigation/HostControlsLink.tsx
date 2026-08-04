"use client";

import { MouseEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { getHostToken } from "@/lib/deviceStorage";
import { buildHostControlsHref } from "@/lib/hostControlsLink";

export interface HostControlsLinkProps {
  sessionPublicId: string;
  className?: string;
  /** Show a "leave this page?" confirmation before navigating, but only when hasUnsavedChanges is true. */
  confirmBeforeLeave?: boolean;
  hasUnsavedChanges?: boolean;
}

/**
 * Host-only "Host controls" link back to /host/[publicId], shown on the
 * host's own participant-side pages. Renders nothing unless this browser
 * holds a host token for this exact session — the same localStorage slot
 * (scoped per publicId) that /host/[publicId] itself relies on, and that
 * page re-validates the token server-side regardless, so this link is only
 * ever a navigation convenience, never an authorization decision. Read in
 * an effect (not during render) so server and first-paint client output
 * match, avoiding a hydration mismatch — same pattern used for guest-token
 * reads elsewhere in the app.
 */
export function HostControlsLink({
  sessionPublicId,
  className = "",
  confirmBeforeLeave = false,
  hasUnsavedChanges = false,
}: HostControlsLinkProps) {
  const router = useRouter();
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setHostToken(getHostToken(sessionPublicId));
  }, [sessionPublicId]);

  if (!hostToken) return null;

  const href = buildHostControlsHref(sessionPublicId, hostToken);
  const needsConfirm = confirmBeforeLeave && hasUnsavedChanges;

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!needsConfirm) return;
    e.preventDefault();
    setShowConfirm(true);
  }

  return (
    <>
      <Link
        href={href}
        onClick={handleClick}
        aria-label="Return to host controls for this tasting"
        className={`inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-cellar-text/60 transition-colors hover:bg-cellar-maroon/5 hover:text-cellar-maroon focus:outline-none focus:ring-2 focus:ring-cellar-gold ${className}`}
      >
        Host controls
      </Link>

      {showConfirm && (
        <Modal title="Leave this page?" onClose={() => setShowConfirm(false)}>
          <p>You have unsaved changes. Leaving now will discard them.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>
              Stay
            </Button>
            <Button variant="danger" onClick={() => router.push(href)}>
              Go to host controls
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
