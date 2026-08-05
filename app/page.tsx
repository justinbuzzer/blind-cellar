import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { TastingModeCard } from "@/components/landing/TastingModeCard";
import { EditorialQuoteBand } from "@/components/landing/EditorialQuoteBand";
import { LandingFooter } from "@/components/landing/LandingFooter";

const TASTING_FORMATS = [
  {
    number: "01",
    title: "Full blind tasting",
    description:
      "All bottles are tasted blind before any wines are revealed. Best for comparative tastings where complete objectivity matters.",
  },
  {
    number: "02",
    title: "Course-by-course reveal",
    description:
      "Each bottle is tasted blind, then revealed before moving to the next. Best for casual dinners and relaxed tasting discussions.",
  },
  {
    number: "03",
    title: "Seen tasting",
    description:
      "All bottles are visible from the start. Best for relaxed tastings where guests want to compare wines openly and rate them at their own pace.",
  },
] as const;

export default function HomePage() {
  return (
    <main>
      <HeroSection />

      <HowItWorksSection />

      <section id="tasting-formats" className="scroll-mt-8 bg-landing-parchment py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="landing-fade-in max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-landing-claret">
              Three ways to taste
            </p>
            <h2 className="mt-4 font-display text-3xl font-semibold text-landing-plum sm:text-4xl">
              Built for the way your table gathers.
            </h2>
          </div>

          <div className="mt-14 divide-y divide-landing-stone sm:mt-16 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {TASTING_FORMATS.map((format) => (
              <TastingModeCard
                key={format.number}
                number={format.number}
                title={format.title}
                description={format.description}
              />
            ))}
          </div>

          <a
            href="#tasting-formats"
            className="mt-14 inline-block text-sm font-medium text-landing-claret underline-offset-4 transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold sm:mt-16"
          >
            Explore tasting formats &rarr;
          </a>
        </div>
      </section>

      <EditorialQuoteBand />

      <LandingFooter />
    </main>
  );
}
