/**
 * Hex mirror of the app's `cellar.*` Tailwind palette (see
 * tailwind.config.ts) — @react-pdf/renderer has its own StyleSheet, not
 * Tailwind/CSS custom properties, so this is the one place those values are
 * restated for PDF output. Keep in sync with tailwind.config.ts by hand if
 * that palette ever changes.
 */
export const pdfColors = {
  bg: "#F6F1E8",
  bgDeep: "#EEE5D8",
  maroon: "#541F2A",
  maroonDark: "#37141B",
  gold: "#B08D57",
  text: "#24151A",
  muted: "#746B63",
  border: "#D9CDBD",
  success: "#3F6652",
  danger: "#8D3440",
} as const;
