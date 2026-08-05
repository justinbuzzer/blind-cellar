/**
 * Elegant stand-in for a photograph that hasn't been licensed yet (see
 * lib/appImages.ts for internal-page slots, components/landing/imageConfig.ts
 * for the landing page's). Deliberately abstract — a flat deep-plum field
 * with a faint, fine-line texture suggesting vine rows — rather than a
 * literal "image coming soon" placard, so every page still reads as
 * finished. Never rendered once a real photo is wired up.
 */
export function ImagePlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 bg-cellar-text ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(115deg, rgba(246,241,232,0.05) 0px, rgba(246,241,232,0.05) 1px, transparent 1px, transparent 28px)",
      }}
    />
  );
}
