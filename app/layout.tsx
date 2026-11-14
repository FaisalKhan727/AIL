import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Brand typefaces, pulled from Google Fonts at build time and self-hosted by
// Next (no layout shift, no third-party request from the browser).
// IBM Plex: a working typeface built for dense operational screens. The
// condensed cut carries headings and big numbers.
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const display = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Vigilo", template: "%s · Vigilo" },
  description: "Security workforce operations: rostering, licence compliance and timesheets",
  manifest: "/manifest.json",
  applicationName: "Vigilo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vigilo",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
