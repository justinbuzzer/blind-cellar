/**
 * Central place to wire up the home page's two editorial photographs once
 * licensed assets are available. Until then, `placeholder: true` tells
 * HeroSection/EditorialQuoteBand to render an elegant CSS-only panel instead
 * of a broken/missing image — nothing here can fail a production build.
 *
 * To go live with a real photo:
 * 1. Drop the file in `public/images/` (e.g. `public/images/hero-vineyard.jpg`).
 * 2. Set `src` below to that path (e.g. "/images/hero-vineyard.jpg").
 * 3. Set `placeholder` to `false`.
 * 4. Update `alt` if the description no longer matches the actual photo.
 *
 * Images stay local (`public/`) rather than remote, so no `next.config.js`
 * `images.remotePatterns` entry is needed for `next/image` to serve them.
 */
export interface LandingImageSlot {
  /** Path under `public/`, or null while no licensed asset exists yet. */
  src: string | null;
  alt: string;
  placeholder: boolean;
}

/**
 * Full-bleed hero background. Brief: a real, prestigious European vineyard
 * at dawn or dusk — rows of vines in soft low-angle light, not a close-up of
 * grapes or a generic stock "wine" photo.
 */
export const heroImage: LandingImageSlot = {
  src: null,
  alt: "Rows of vines at a European vineyard, lit by soft dawn light",
  placeholder: true,
};

/**
 * Secondary image for the "Experience statement" band. Brief: a dim wine
 * cellar with bottles aging in rows, or a narrow panoramic vineyard crop —
 * whichever pairs best with the pull-quote once a photo is chosen.
 */
export const cellarImage: LandingImageSlot = {
  src: null,
  alt: "A quiet wine cellar with bottles resting in rows under warm, low light",
  placeholder: true,
};
