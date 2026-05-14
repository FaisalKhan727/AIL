import type { Metadata, Viewport } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Vigilo Guards",
  description: "Shift notifications, accept/reject, clock in/out",
  manifest: "/g/manifest.json",
  applicationName: "Vigilo Guards",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vigilo Guards",
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

export default function GuardAppLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
