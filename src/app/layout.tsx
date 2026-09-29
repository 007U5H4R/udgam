import type { Metadata, Viewport } from "next";
import { Figtree, Noto_Sans_Kannada } from "next/font/google";
import { connection } from "next/server";
import type { ReactNode } from "react";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-figtree",
});

const notoSansKannada = Noto_Sans_Kannada({
  subsets: ["kannada"],
  weight: ["400", "600", "700"],
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
  return (
    <html lang="en" className={`${figtree.variable} ${notoSansKannada.variable}`}>
      <body>{children}</body>
    </html>
  );
}
