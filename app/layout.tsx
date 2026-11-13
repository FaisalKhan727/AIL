import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans, Syne } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Brand typefaces, pulled from Google Fonts at build time and self-hosted by
// Next (no layout shift, no third-party request from the browser).
const sans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const display = Syne({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-display" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

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
  themeColor: "#0B1520",
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
