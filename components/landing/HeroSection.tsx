import Image from "next/image";
import Link from "next/link";
import { LandingHeader } from "./LandingHeader";
import { ImagePlaceholder } from "@/components/ImagePlaceholder";
import { heroImage } from "./imageConfig";

/**
 * Full-bleed editorial hero. Owns the background photograph (or its
 * placeholder — see imageConfig.ts) and the claret overlay that keeps
 * LandingHeader and the hero copy readable over it.
 */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-landing-plum">
      <div className="absolute inset-0">
        {!heroImage.placeholder && heroImage.src ? (
          <Image
            src={heroImage.src}
            alt={heroImage.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <ImagePlaceholder />
        )}
        {/* Dark claret wash for text contrast — kept over both the real photo and the placeholder. */}
        <div className="absolute inset-0 bg-landing-claret/55" aria-hidden="true" />
        <div className="absolute inset-0 bg-landing-plum/25" aria-hidden="true" />
      </div>

      <div className="relative flex min-h-[640px] flex-col">
        <LandingHeader />

        <div className="landing-fade-in mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-20 text-center sm:px-10">
          <p className="font-display text-lg italic text-landing-gold sm:text-xl">
            A private table. A hidden bottle. A shared memory.
          </p>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.1] text-landing-parchment sm:text-6xl">
            A better way to gather around wine.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-landing-parchment/85 sm:text-lg">
            Create a private tasting, invite your table, and let every bottle
            reveal its story in its own time.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/host/new"
              className="inline-flex min-h-[48px] w-full items-center justify-center bg-landing-parchment px-7 text-sm font-medium text-landing-claret transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold sm:w-auto"
            >
              Host a tasting
            </Link>
            <Link
              href="/join"
              className="inline-flex min-h-[48px] w-full items-center justify-center border border-landing-parchment/70 px-7 text-sm font-medium text-landing-parchment transition-colors hover:border-landing-parchment hover:bg-landing-parchment/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold sm:w-auto"
            >
              Join a tasting
            </Link>
          </div>

          <Link
            href="/demo"
            aria-label="See a sample Blind Cellar tasting report"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center gap-1.5 py-2 text-sm text-landing-parchment/80 underline-offset-4 transition-colors hover:text-landing-parchment hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold"
          >
            See a demo report <span aria-hidden="true">&rarr;</span>
          </Link>

          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-landing-parchment/60">
            Full blind&nbsp;&nbsp;·&nbsp;&nbsp;Course reveal&nbsp;&nbsp;·&nbsp;&nbsp;Seen tasting
          </p>
        </div>
      </div>
    </section>
  );
}
