import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vigilo Guard",
  description: "Your shifts, clock-in and licences",
  manifest: "/guard.webmanifest",
};

export default function GuardRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-[100dvh] w-full max-w-md bg-background sm:border-x">{children}</div>;
}
