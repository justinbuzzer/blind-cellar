/**
 * Named photograph slots for the internal application (host control,
 * course-reveal waiting, per-bottle reveal, results). Mirrors
 * components/landing/imageConfig.ts's pattern exactly — until a licensed
 * photo exists, `placeholder: true` renders components/ImagePlaceholder.tsx
 * instead of a broken/missing image, so nothing here can fail a production
 * build.
 *
 * To go live with a real photo:
 * 1. Drop the file in `public/images/` (e.g. `public/images/cellar-band.jpg`).
 * 2. Set the slot's `src` to that path.
 * 3. Set `placeholder` to `false`.
 *
 * Photography is used only at the approved atmospheric moments (see README)
 * — never inside a form, never where it could obscure a control, and never
 * anywhere it could imply a still-blind bottle's identity.
 */
export interface AppImageSlot {
  src: string | null;
  alt: string;
  placeholder: boolean;
}

/** Host control page, desktop-only header band. */
export const hostControlImage: AppImageSlot = {
  src: null,
  alt: "A quiet vineyard at rest, seen from the host's private tasting room",
  placeholder: true,
};

/** Course-reveal "your guess is locked" waiting screen. */
export const waitingToRevealImage: AppImageSlot = {
  src: null,
  alt: "A dim cellar corridor, bottles waiting in the quiet before a reveal",
  placeholder: true,
};

/** Per-bottle reveal screen, shown only after that bottle's identity is public. */
export const bottleRevealImage: AppImageSlot = {
  src: null,
  alt: "A single wine bottle and glass, softly lit at the moment of reveal",
  placeholder: true,
};

/** Full-blind and seen-tasting final results, report header. */
export const resultsImage: AppImageSlot = {
  src: null,
  alt: "An evening tasting table after the wines have been poured",
  placeholder: true,
};

/** Tasting archive header/empty state — a quiet cellar shelf, never a specific bottle. */
export const archiveImage: AppImageSlot = {
  src: null,
  alt: "Rows of resting bottles in a quiet private cellar",
  placeholder: true,
};

/** Sign-in page, desktop-only strip above the form — never behind the email/code inputs. */
export const signInImage: AppImageSlot = {
  src: null,
  alt: "A private tasting ledger resting on a cellar table",
  placeholder: true,
};
