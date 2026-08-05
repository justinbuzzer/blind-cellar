import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// Editorial display serif, used only by the redesigned home page
// (components/landing/*) for its large headings. Loaded here (once, at the
// root) purely so the CSS variable is available — every other page keeps
// rendering in Inter (`font-sans`, the body's default) exactly as before.
const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Blind Cellar",
  description: "Private blind tasting, fairly scored.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${cormorantGaramond.variable} font-sans antialiased bg-cellar-bg text-cellar-text`}
      >
        {children}
      </body>
    </html>
  );
}
