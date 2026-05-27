import type { Metadata, Viewport } from "next";
import "./cleaning.css";

export const metadata: Metadata = {
  title: "ACS Cleaning | Allied Corporate Services",
  description:
    "Professional commercial and residential cleaning services by Allied Corporate Services. Quality cleaning solutions tailored to your needs.",
  applicationName: "ACS Cleaning",
};

export const viewport: Viewport = {
  themeColor: "#0E9F6E",
  width: "device-width",
  initialScale: 1,
};

export default function CleaningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
