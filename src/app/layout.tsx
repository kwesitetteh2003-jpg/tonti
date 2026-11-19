import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-src",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-ui-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tonti — Lightning tontines for West Africa",
  description:
    "A Lightning wallet and rotating savings circle for tontines and susu groups across West Africa. Test network only, no real funds.",
  applicationName: "Tonti",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Tonti", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f3eee4",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${manrope.variable}`}>
      <body
        style={
          {
            "--font-display": "var(--font-display-src), Fraunces, serif",
            "--font-ui": "var(--font-ui-src), Manrope, sans-serif",
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
