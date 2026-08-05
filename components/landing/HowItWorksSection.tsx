import Link from "next/link";
import { TastingModeCard } from "./TastingModeCard";

const STEPS = [
  {
    number: "01",
    title: "Create the table",
    description:
      "Choose your tasting format, set the order of service, and share a private QR code or join link with your guests.",
  },
  {
    number: "02",
    title: "Register the bottles",
    description:
      "Each contributor adds their own wine privately. Blind Cellar assigns every bottle an anonymous number.",
  },
  {
    number: "03",
    title: "Taste together",
    description:
      "Guests record guesses or ratings from their phones, while the host keeps the tasting moving at the table.",
  },
  {
    number: "04",
    title: "Reveal the story",
    description:
      "Reveal each bottle in its own time, compare impressions, and keep a clear report of the evening.",
  },
] as const;

/**
 * Reuses TastingModeCard (numeral + rule + title + description) for each
 * step, and the same mobile-divide-y/desktop-divide-x responsive pattern the
 * tasting-formats section already uses — same editorial "page from a
 * tasting booklet" feel, no new visual language introduced.
 */
export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-8 bg-landing-parchment py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <div className="landing-fade-in max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-landing-claret">
            How it works
          </p>
          <h2 className="mt-4 font-display text-3xl font-semibold text-landing-plum sm:text-4xl">
            From bottle to shared memory.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-landing-warmgrey">
            Blind Cellar keeps the practical details out of the way, so the
            table can focus on the wine.
          </p>
        </div>

        <div className="mt-14 divide-y divide-landing-stone sm:grid sm:grid-cols-2 sm:gap-x-10 sm:gap-y-12 sm:divide-y-0 lg:grid-cols-4 lg:gap-y-0 lg:divide-x">
          {STEPS.map((step) => (
            <TastingModeCard
              key={step.number}
              number={step.number}
              title={step.title}
              description={step.description}
            />
          ))}
        </div>

        <Link
          href="/demo"
          aria-label="See a sample Blind Cellar tasting report"
          className="mt-14 inline-flex items-center gap-1.5 text-sm font-medium text-landing-claret underline-offset-4 transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold sm:mt-16"
        >
          See a demo report <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </section>
  );
}
