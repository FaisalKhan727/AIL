import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Vigilo Roster",
  description: "Security rostering and timesheets",
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
  themeColor: "#0B1E3F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
