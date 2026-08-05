"use client";

import { MouseEvent, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";

export interface HomeLinkProps {
  /** Show a "leave this page?" confirmation before navigating, but only when hasUnsavedChanges is true. */
  confirmBeforeLeave?: boolean;
  hasUnsavedChanges?: boolean;
  className?: string;
}

/**
 * Small persistent "Home" control used across app screens. Renders nothing
 * on the home page itself. Navigates via a real <Link> so it works even
 * before hydration; the confirmation dialog only intercepts the click when
 * both confirmBeforeLeave and hasUnsavedChanges are true.
 */
export function HomeLink({
  confirmBeforeLeave = false,
  hasUnsavedChanges = false,
  className = "",
}: HomeLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);

  if (pathname === "/") return null;

  const needsConfirm = confirmBeforeLeave && hasUnsavedChanges;

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!needsConfirm) return;
    e.preventDefault();
    setShowConfirm(true);
  }

  return (
    <>
      <Link
        href="/"
        onClick={handleClick}
        aria-label="Return to home"
        className={`inline-flex min-h-[44px] items-center gap-1 self-start rounded-sm px-2 -ml-2 text-sm font-medium text-cellar-muted transition-colors hover:bg-cellar-maroon/5 hover:text-cellar-maroon focus:outline-none focus:ring-2 focus:ring-cellar-gold ${className}`}
      >
        Home
      </Link>

      {showConfirm && (
        <Modal title="Leave this page?" onClose={() => setShowConfirm(false)}>
          <p>You have unsaved changes. Leaving now will discard them.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>
              Stay
            </Button>
            <Button variant="danger" onClick={() => router.push("/")}>
              Leave for home
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
