import Image from "next/image";
import Link from "next/link";
import { ImagePlaceholder } from "@/components/ImagePlaceholder";
import { cellarImage } from "./imageConfig";

/**
 * Quiet, image-supported pull-quote band between the tasting formats and the
 * footer. Owns the secondary photograph (or its placeholder — see
 * imageConfig.ts) and its own claret/plum overlay for text contrast.
 */
export function EditorialQuoteBand() {
  return (
    <section className="relative isolate overflow-hidden bg-landing-plum py-24 sm:py-32">
      <div className="absolute inset-0">
        {!cellarImage.placeholder && cellarImage.src ? (
          <Image
            src={cellarImage.src}
            alt={cellarImage.alt}
            fill
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <ImagePlaceholder />
        )}
        <div className="absolute inset-0 bg-landing-plum/70" aria-hidden="true" />
      </div>

      <div className="landing-fade-in relative mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 text-center sm:px-10">
        <p className="font-display text-2xl italic leading-snug text-landing-parchment sm:text-3xl">
          &ldquo;Wine is made in the vineyard; the memory is made at the
          table.&rdquo;
        </p>
        <p className="max-w-xl text-base leading-relaxed text-landing-parchment/80">
          Blind Cellar gives every tasting a simple private room: a place to
          contribute bottles, record impressions, reveal discoveries, and
          keep the evening moving.
        </p>
        <Link
          href="/host/new"
          className="mt-2 inline-flex min-h-[48px] items-center justify-center border border-landing-parchment/70 px-7 text-sm font-medium text-landing-parchment transition-colors hover:border-landing-parchment hover:bg-landing-parchment/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-gold"
        >
          Begin a tasting
        </Link>
      </div>
    </section>
  );
}
