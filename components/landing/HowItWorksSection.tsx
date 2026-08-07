"use client";

import { KeyboardEvent, useRef, useState } from "react";
import Link from "next/link";
import { TastingModeCard } from "./TastingModeCard";

type Audience = "host" | "guest";

const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "host", label: "For hosts" },
  { id: "guest", label: "For guests" },
];

interface FlowStep {
  number: string;
  title: string;
  description: string;
}

interface FlowContent {
  steps: FlowStep[];
  ctaHref: string;
  ctaLabel: string;
}

const FLOWS: Record<Audience, FlowContent> = {
  host: {
    steps: [
      {
        number: "01",
        title: "Create a tasting",
        description: "Choose a tasting format and create a private room.",
      },
      {
        number: "02",
        title: "Invite your table",
        description: "Share the QR code, link, or join code with your guests.",
      },
      {
        number: "03",
        title: "Set the order",
        description: "Guests register bottles privately. Arrange the order of service.",
      },
      {
        number: "04",
        title: "Taste and reveal",
        description: "Guide the tasting, reveal wines at the right time, and keep the final report.",
      },
    ],
    ctaHref: "/host/new",
    ctaLabel: "Host a tasting",
  },
  guest: {
    steps: [
      {
        number: "01",
        title: "Join the table",
        description: "Scan the host’s QR code or enter the private join code.",
      },
      {
        number: "02",
        title: "Register your bottle",
        description: "Add your wine privately. Its identity stays hidden until reveal.",
      },
      {
        number: "03",
        title: "Taste and record",
        description: "Enter your guesses or ratings from your phone.",
      },
      {
        number: "04",
        title: "Discover the wines",
        description: "See the reveal, compare impressions, and revisit the tasting report.",
      },
    ],
    ctaHref: "/join",
    ctaLabel: "Join a tasting",
  },
};

/**
 * Toggleable Host/Guest "How it works" (see redesign brief). Only the active
 * flow is ever rendered in the DOM — never hidden-but-focusable — and the
 * toggle is a real ARIA tablist (roving tabindex, arrow-key navigation),
 * mirroring the accessible pattern components/archive/ArchiveTabs.tsx already
 * established for "switching between independent panels", just restyled with
 * this page's own `landing-*` tokens in the segmented-control look the brief
 * calls for, since ArchiveTabs/SegmentedControl are hardcoded to the app's
 * `cellar-*` palette.
 */
export function HowItWorksSection() {
  const [audience, setAudience] = useState<Audience>("host");
  const tabRefs = useRef<Record<Audience, HTMLButtonElement | null>>({ host: null, guest: null });

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const nextIndex =
      e.key === "ArrowRight" ? (index + 1) % AUDIENCES.length : (index - 1 + AUDIENCES.length) % AUDIENCES.length;
    const next = AUDIENCES[nextIndex].id;
    setAudience(next);
    tabRefs.current[next]?.focus();
  }

  const active = FLOWS[audience];

  return (
    <section id="how-it-works" className="scroll-mt-8 bg-landing-parchment py-8 sm:py-12">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <div className="landing-fade-in">
          <h2 className="font-display text-3xl font-semibold text-landing-plum sm:text-4xl">How it works</h2>
        </div>

        <div
          role="tablist"
          aria-label="How it works: for hosts or for guests"
          className="mt-3 inline-flex flex-wrap gap-2"
        >
          {AUDIENCES.map((option, index) => {
            const selected = option.id === audience;
            return (
              <button
                key={option.id}
                ref={(el) => {
                  tabRefs.current[option.id] = el;
                }}
                role="tab"
                type="button"
                id={`how-it-works-tab-${option.id}`}
                aria-selected={selected}
                aria-controls={`how-it-works-panel-${option.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setAudience(option.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`min-h-[44px] rounded-sm border px-5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold ${
                  selected
                    ? "border-landing-claret bg-landing-claret font-semibold text-landing-parchment"
                    : "border-landing-stone bg-landing-parchment font-medium text-landing-plum hover:border-landing-claret/40"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div
          key={audience}
          role="tabpanel"
          id={`how-it-works-panel-${audience}`}
          aria-labelledby={`how-it-works-tab-${audience}`}
          tabIndex={0}
          className="landing-flow-fade mt-5 focus:outline-none sm:mt-8"
        >
          <div className="divide-y divide-landing-stone sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-6 sm:divide-y-0 lg:grid-cols-4 lg:gap-y-0 lg:divide-x">
            {active.steps.map((step) => (
              <TastingModeCard key={step.number} number={step.number} title={step.title} description={step.description} />
            ))}
          </div>

          <Link
            href={active.ctaHref}
            className={`mt-6 inline-flex min-h-[48px] items-center justify-center px-7 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold sm:mt-8 ${
              audience === "host"
                ? "bg-landing-claret text-landing-parchment hover:bg-landing-claret-dark"
                : "border border-landing-claret text-landing-claret hover:bg-landing-claret/5"
            }`}
          >
            {active.ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
