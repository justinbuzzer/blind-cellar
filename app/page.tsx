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

      <section id="tasting-formats" className="scroll-mt-8 bg-landing-parchment py-8 sm:py-12">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="landing-fade-in max-w-2xl">
            <h2 className="font-display text-3xl font-semibold text-landing-plum sm:text-4xl">
              Choose your tasting format
            </h2>
          </div>

          <div className="mt-6 divide-y divide-landing-stone sm:mt-8 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {TASTING_FORMATS.map((format) => (
              <TastingModeCard
                key={format.number}
                number={format.number}
                title={format.title}
                description={format.description}
              />
            ))}
          </div>
        </div>
      </section>

      <EditorialQuoteBand />

      <LandingFooter />
    </main>
  );
}
