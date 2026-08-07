import { ArchiveLink } from "@/components/navigation/ArchiveLink";
import { AccountNav } from "@/components/navigation/AccountNav";
import { ProfileLink } from "@/components/navigation/ProfileLink";
import { CellarLink } from "@/components/navigation/CellarLink";

/**
 * Sits over HeroSection's background image (rendered as the first child
 * there), so its text is always the light "on dark overlay" treatment.
 * Mobile drops the nav links and tagline rather than adding a drawer — see
 * the redesign brief: no complex navigation drawer for a page this small.
 */
export function LandingHeader() {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-start justify-between gap-6 px-6 pt-6 sm:px-10 sm:pt-10">
      <div>
        <p className="font-display text-lg font-semibold tracking-[0.08em] text-landing-parchment">
          BLIND CELLAR
        </p>
        <p className="mt-1 hidden text-sm text-landing-parchment/70 sm:block">
          Private wine tastings, thoughtfully recorded.
        </p>
      </div>

      <nav aria-label="Primary" className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
        <a
          href="#how-it-works"
          className="hidden text-sm text-landing-parchment/85 underline-offset-4 transition-colors hover:text-landing-parchment hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold sm:inline-block"
        >
          How it works
        </a>
        <a
          href="#tasting-formats"
          className="hidden text-sm text-landing-parchment/85 underline-offset-4 transition-colors hover:text-landing-parchment hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold sm:inline-block"
        >
          Tasting formats
        </a>
        <ArchiveLink tone="light" />
        <ProfileLink tone="light" />
        <CellarLink tone="light" />
        <AccountNav tone="light" signedOutLabel="Login" signedOutAriaLabel="Log in to your account" />
      </nav>
    </header>
  );
}
