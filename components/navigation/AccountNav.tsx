"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthUser } from "@/lib/supabase/useAuthUser";

export interface AccountNavProps {
  className?: string;
  /** Renders against a dark background (e.g. the home page's hero overlay) — swaps the light/dark text treatment accordingly. */
  tone?: "light" | "dark";
  /** Overrides the signed-out link's visible text. Defaults to "Keep your tasting record" everywhere except where a caller opts into different copy (e.g. the landing header's "Login"). */
  signedOutLabel?: string;
  /** Optional aria-label for the signed-out link, for use alongside a shorter signedOutLabel. */
  signedOutAriaLabel?: string;
}

/**
 * Signed-out/signed-in account control (see README "Accounts"). Never
 * requires a session — this is purely an optional, restrained entry point,
 * consistent with the rest of this app's navigation (Home, Host controls,
 * Tasting archive) always being available regardless of auth state.
 */
export function AccountNav({
  className = "",
  tone = "dark",
  signedOutLabel = "Keep your tasting record",
  signedOutAriaLabel,
}: AccountNavProps) {
  const pathname = usePathname();
  const { user, loading } = useAuthUser();

  if (loading) return null;
  if (pathname === "/account" || pathname === "/account/sign-in") return null;

  const base = "inline-flex min-h-[44px] items-center gap-1 rounded-sm px-2 text-sm font-medium underline-offset-4 transition-colors hover:underline focus:outline-none focus:ring-2";
  const toneClasses =
    tone === "light"
      ? "text-landing-parchment/85 hover:text-landing-parchment focus-visible:ring-landing-gold"
      : "text-cellar-muted hover:text-cellar-maroon focus:ring-cellar-gold";

  if (user) {
    return (
      <Link
        href="/account"
        aria-label="View your tasting record account"
        className={`${base} ${toneClasses} ${className}`}
      >
        Your tasting record
      </Link>
    );
  }

  return (
    <Link
      href="/account/sign-in"
      aria-label={signedOutAriaLabel}
      className={`${base} ${toneClasses} ${className}`}
    >
      {signedOutLabel}
    </Link>
  );
}
