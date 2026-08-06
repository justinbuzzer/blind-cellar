"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthUser } from "@/lib/supabase/useAuthUser";

export interface ArchiveLinkProps {
  className?: string;
  /** Renders against a dark background (e.g. the home page's hero overlay) — swaps the light/dark text treatment accordingly. */
  tone?: "light" | "dark";
}

/**
 * Quiet, always-available archive nav link (see README "Tasting archive").
 * Unlike HostControlsLink, this is never conditional on a stored token — the
 * archive page itself decides what a given browser can see, so the link is
 * just a navigation convenience, renders nothing on the archive page itself.
 * Label only changes for a signed-in user ("My archive" — see README
 * "Accounts"); the destination and the archive's own browser-linked
 * authorization are completely unchanged either way.
 */
export function ArchiveLink({ className = "", tone = "dark" }: ArchiveLinkProps) {
  const pathname = usePathname();
  const { user } = useAuthUser();
  if (pathname === "/archive") return null;

  const base = "inline-flex min-h-[44px] items-center gap-1 rounded-sm px-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2";
  const toneClasses =
    tone === "light"
      ? "text-landing-parchment/85 underline-offset-4 hover:text-landing-parchment hover:underline focus-visible:ring-landing-gold"
      : "text-cellar-muted hover:bg-cellar-maroon/5 hover:text-cellar-maroon focus:ring-cellar-gold";

  return (
    <Link href="/archive" aria-label="View your tasting archive" className={`${base} ${toneClasses} ${className}`}>
      {user ? "My archive" : "Tasting archive"}
    </Link>
  );
}
