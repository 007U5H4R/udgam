import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { isLang, LANG_COOKIE } from "../lib/i18n";
import "./globals.css";

// Self-hosted (SIL OFL 1.1, files from @fontsource 5.3.0; licences beside them in ./fonts) so `next build`
// needs no network: next/font/google's build-time download made CI's build step fail intermittently.
const figtree = localFont({
  src: [
    { path: "./fonts/figtree-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/figtree-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/figtree-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/figtree-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/figtree-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  variable: "--font-figtree",
});

const notoSansKannada = localFont({
  src: [
    { path: "./fonts/noto-sans-kannada-kannada-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/noto-sans-kannada-kannada-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/noto-sans-kannada-kannada-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-noto-sans-kannada",
});

export const metadata: Metadata = {
  title: "Udgam",
  description: "Verifiable agricultural provenance for coffee",
  // The cherry-cluster icons (TKT-10, scripts/make-icons.ts); the manifest is src/app/manifest.ts.
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0A0E0C",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page renders per request: src/proxy.ts sets a fresh CSP nonce, and Next can put it on its
  // bootstrap scripts only when it renders the page (a prerendered page would carry none; TSK-19.5).
  await connection();
  // The capture app's language choice (TSK-11.7): ಕನ್ನಡ when chosen, else English (the shipped default, N5).
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  return (
    <html lang={isLang(chosen) ? chosen : "en"} className={`${figtree.variable} ${notoSansKannada.variable}`}>
      <body>{children}</body>
    </html>
  );
}
