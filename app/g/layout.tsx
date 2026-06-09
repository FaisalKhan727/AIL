import type { Metadata, Viewport } from "next";
import "../globals.css";
import { SopReackBanner } from "@/components/g/sop-reack-banner";

export const metadata: Metadata = {
  title: "Vigilo Guards",
  description: "Shift notifications, accept/reject, clock in/out",
  manifest: "/g/manifest.json",
  applicationName: "Vigilo Guards",
  appleWebApp: {
    capable: true,
    // "default" = iOS draws an opaque status bar with dark text on a light
    // background; webview content starts BELOW it. Previously "black-
    // translucent" let content render under the status bar, which made
    // "Hi, Faisal" overlap with the clock/battery icons.
    statusBarStyle: "default",
    title: "Vigilo Guards",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Light shell colour so the status bar background blends with the page.
  themeColor: "#F8FAFC",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function GuardAppLayout({ children }: { children: React.ReactNode }) {
  // Safe-area padding on all four edges so the app respects the notch /
  // Dynamic Island (top), home indicator (bottom), and landscape inset
  // (left/right). Inset values are ~0 with statusBarStyle="default" but
  // the padding is defensive against future device variations.
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-safe-t pb-safe-b pl-safe-l pr-safe-r">
      <SopReackBanner />
      {children}
    </div>
  );
}
