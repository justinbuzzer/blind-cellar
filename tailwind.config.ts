import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // The app-wide "Blind Cellar" editorial design system (see
        // components/PageHeader.tsx and friends). Originally a narrower
        // maroon/gold palette; retheme to the approved fine-wine palette so
        // every page built on the shared primitives (Button, Card,
        // TextField, ...) picks it up in one place, with zero per-page
        // className changes needed. Values match the landing page's
        // `landing.*` tokens (see below) so the whole app — marketing and
        // internal — reads as one consistent system, just reached via two
        // historically-separate class prefixes.
        cellar: {
          bg: "#F6F1E8",
          "bg-deep": "#EEE5D8",
          maroon: "#541F2A",
          "maroon-dark": "#37141B",
          gold: "#B08D57",
          text: "#24151A",
          muted: "#746B63",
          border: "#D9CDBD",
          success: "#3F6652",
          warning: "#936C2F",
          danger: "#8D3440",
        },
        // Editorial palette for the redesigned home page only (see
        // components/landing/*) — purely additive, so every existing screen
        // keeps using the `cellar.*` tokens above completely unchanged.
        // `landing.gold` intentionally mirrors `cellar.gold` (#B08D57, the
        // same antique-gold accent already in use) rather than duplicating a
        // slightly different value — reused here just so landing components
        // can stay self-contained under one `landing-*` class prefix.
        landing: {
          parchment: "#F6F1E8",
          claret: "#541F2A",
          "claret-dark": "#3D1420",
          plum: "#24151A",
          gold: "#B08D57",
          stone: "#D9CDBD",
          warmgrey: "#746B63",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        // Editorial serif for the home page's display headings only (see
        // components/landing/*). Additive — `font-sans` above (Inter) stays
        // the default body font everywhere else.
        display: ["var(--font-display)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
