import type { Metadata } from "next";
import localFont from "next/font/local";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "sonner";
import "./globals.css";

const display = localFont({ src: "../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2", variable: "--font-display", weight: "100 900", display: "swap" });
const body = localFont({ src: "../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2", variable: "--font-body", weight: "300 900", display: "swap" });
const hindi = localFont({ src: "../../node_modules/@fontsource-variable/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-wght-normal.woff2", variable: "--font-hi", weight: "100 900", display: "swap" });


export const metadata: Metadata = {
  metadataBase: new URL("https://heritagehub-vert.vercel.app"),

  title: {
    default: "HeritageHub | Discover India's Heritage Sites",
    template: "%s | HeritageHub",
  },

  description:
    "Explore India's historical monuments and cultural heritage sites. Discover destinations, check expected visitor crowds, and plan your visit with HeritageHub.",

  applicationName: "HeritageHub",

  keywords: [
    "HeritageHub",
    "Indian heritage sites",
    "historical monuments in India",
    "Indian tourism",
    "heritage tourism",
    "historical places in India",
    "monument tickets",
    "heritage site crowd forecast",
    "travel planning India",
  ],

  authors: [{ name: "HeritageHub" }],
  creator: "HeritageHub",
  publisher: "HeritageHub",

  category: "travel",

  openGraph: {
    type: "website",
    url: "https://heritagehub-vert.vercel.app",
    siteName: "HeritageHub",
    title: "HeritageHub | Discover India's Heritage Sites",
    description:
      "Discover India's heritage destinations, explore historical monuments, check expected crowds, and plan your visit.",
    locale: "en_IN",
  },

  twitter: {
    card: "summary",
    title: "HeritageHub | Discover India's Heritage Sites",
    description:
      "Explore India's heritage sites, check expected crowds, and plan your next visit.",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hindi.variable}`}>
      <body><a href="#main" className="sr-only z-[100] rounded bg-forest px-4 py-2 text-ivory focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Skip to content</a><I18nProvider>{children}</I18nProvider><Toaster position="top-center" richColors closeButton /></body>
    </html>
  );
}
