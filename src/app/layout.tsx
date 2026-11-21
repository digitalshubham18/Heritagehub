import type { Metadata } from "next";
import localFont from "next/font/local";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "sonner";
import "./globals.css";

const display = localFont({ src: "../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2", variable: "--font-display", weight: "100 900", display: "swap" });
const body = localFont({ src: "../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2", variable: "--font-body", weight: "300 900", display: "swap" });
const hindi = localFont({ src: "../../node_modules/@fontsource-variable/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-wght-normal.woff2", variable: "--font-hi", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  title: { default: "HeritageHub: heritage site tickets and crowd forecasts", template: "%s | HeritageHub" },
  description: "Book timed tickets for India's heritage sites and see how busy each hour is expected to be.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hindi.variable}`}>
      <body><a href="#main" className="sr-only z-[100] rounded bg-forest px-4 py-2 text-ivory focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Skip to content</a><I18nProvider>{children}</I18nProvider><Toaster position="top-center" richColors closeButton /></body>
    </html>
  );
}
