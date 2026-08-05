import { ReactNode } from "react";
import Image from "next/image";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { AppImageSlot } from "@/lib/appImages";

interface ImageBandProps {
  image: AppImageSlot;
  className?: string;
  children?: ReactNode;
}

/**
 * A restrained atmospheric photo band (or its placeholder — see
 * lib/appImages.ts) for the small set of approved internal-page moments:
 * host control overview, course-reveal waiting, per-bottle reveal, and
 * results headers. Never placed inside a form or where it could obscure a
 * control, and never used pre-reveal in a way that could imply a still-blind
 * bottle's identity.
 */
export function ImageBand({ image, className = "", children }: ImageBandProps) {
  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      {!image.placeholder && image.src ? (
        <Image src={image.src} alt={image.alt} fill sizes="100vw" className="object-cover" />
      ) : (
        <ImagePlaceholder />
      )}
      <div className="absolute inset-0 bg-cellar-text/45" aria-hidden="true" />
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
