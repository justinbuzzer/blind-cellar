"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthUser } from "@/lib/supabase/useAuthUser";

export interface ProfileLinkProps {
  className?: string;
  /** Renders against a dark background (e.g. the home page's hero overlay) — swaps the light/dark text treatment accordingly. */
  tone?: "light" | "dark";
}

/**
 * Signed-in-only nav link to the Palate Profile (see README "Palate
 * Profile"). Renders nothing when signed out — there is no equivalent
 * "keep your palate" prompt the way AccountNav has for accounts, since the
 * profile itself has nothing to show a signed-out visitor. Deliberately kept
 * off active blind-guess entry, bottle registration, live host controls, and
 * any pre-reveal screen — only ever placed on calm, already-settled pages
 * (home, account, archive, and a revealed final report).
 */
export function ProfileLink({ className = "", tone = "dark" }: ProfileLinkProps) {
  const pathname = usePathname();
  const { user, loading } = useAuthUser();

  if (loading || !user) return null;
  if (pathname === "/profile") return null;

  const base =
    "inline-flex min-h-[44px] items-center gap-1 rounded-sm px-2 text-sm font-medium underline-offset-4 transition-colors hover:underline focus:outline-none focus:ring-2";
  const toneClasses =
    tone === "light"
      ? "text-landing-parchment/85 hover:text-landing-parchment focus-visible:ring-landing-gold"
      : "text-cellar-muted hover:text-cellar-maroon focus:ring-cellar-gold";

  return (
    <Link href="/profile" aria-label="View your palate profile" className={`${base} ${toneClasses} ${className}`}>
      Your palate
    </Link>
  );
}
