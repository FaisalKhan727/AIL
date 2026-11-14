"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, CalendarDays, Home, ListChecks, UserRound } from "lucide-react";
import { VigiloMark, VigiloWordmark } from "@/components/shell/logo";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/m", label: "Today", icon: Home },
  { href: "/m/shifts", label: "Shifts", icon: CalendarDays },
  { href: "/m/work", label: "Tasks", icon: ListChecks },
  { href: "/m/licences", label: "Licences", icon: BadgeCheck },
  { href: "/m/profile", label: "Profile", icon: UserRound },
];

export function GuardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-card pt-safe">
        <div className="flex h-12 items-center gap-2 px-4">
          <VigiloMark className="h-5 w-5" />
          <VigiloWordmark className="text-[15px]" />
          <span className="eyebrow ml-1 rounded border px-1.5 py-0.5">Guard</span>
        </div>
      </header>
      <main className="px-4 pb-tabbar pt-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t bg-card pb-safe sm:border-x" aria-label="Primary">
        <ul className="grid h-16 grid-cols-5">
          {TABS.map((t) => {
            const active = t.href === "/m" ? pathname === "/m" : pathname.startsWith(t.href);
            const Icon = t.icon;
            return (
              <li key={t.href} className="contents">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 border-t-2 text-[11px]",
                    active ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "text-cyan")} />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
