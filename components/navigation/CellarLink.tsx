"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthUser } from "@/lib/supabase/useAuthUser";

export interface CellarLinkProps {
  className?: string;
  /** Renders against a dark background (e.g. the home page's hero overlay) — swaps the light/dark text treatment accordingly. */
  tone?: "light" | "dark";
}

/**
 * Signed-in-only nav link to the Personal Cellar (see README "Personal
 * Cellar"). Renders nothing when signed out — there is no functional
 * destination to send a signed-out visitor to here, unlike AccountNav's
 * "keep your tasting record" invitation. Kept off active blind-guess entry,
 * bottle registration, and live host-control pages — only ever placed on
 * calm, already-settled pages (home, account).
 */
export function CellarLink({ className = "", tone = "dark" }: CellarLinkProps) {
  const pathname = usePathname();
  const { user, loading } = useAuthUser();

  if (loading || !user) return null;
  if (pathname === "/cellar") return null;

  const base =
    "inline-flex min-h-[44px] items-center gap-1 rounded-sm px-2 text-sm font-medium underline-offset-4 transition-colors hover:underline focus:outline-none focus:ring-2";
  const toneClasses =
    tone === "light"
      ? "text-landing-parchment/85 hover:text-landing-parchment focus-visible:ring-landing-gold"
      : "text-cellar-muted hover:text-cellar-maroon focus:ring-cellar-gold";

  return (
    <Link href="/cellar" aria-label="View your personal cellar" className={`${base} ${toneClasses} ${className}`}>
      My cellar
    </Link>
  );
}
