import Link from "next/link";

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-landing-plum py-14">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:px-10">
        <p className="font-display text-base font-semibold tracking-[0.08em] text-landing-parchment">
          BLIND CELLAR
        </p>
        <p className="text-sm text-landing-parchment/70">
          Private wine tastings, thoughtfully recorded.
        </p>
        <nav aria-label="Footer" className="flex items-center gap-6">
          <Link
            href="/host/new"
            className="text-sm text-landing-parchment/85 underline-offset-4 transition-colors hover:text-landing-parchment hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold"
          >
            Host a tasting
          </Link>
          <Link
            href="/join"
            className="text-sm text-landing-parchment/85 underline-offset-4 transition-colors hover:text-landing-parchment hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold"
          >
            Join a tasting
          </Link>
          <Link
            href="/demo"
            aria-label="See a sample Blind Cellar tasting report"
            className="text-sm text-landing-parchment/85 underline-offset-4 transition-colors hover:text-landing-parchment hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold"
          >
            See a demo report
          </Link>
        </nav>
        <p className="mt-4 text-xs text-landing-parchment/50">
          &copy; {year} Blind Cellar.
        </p>
      </div>
    </footer>
  );
}
