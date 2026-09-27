"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, CalendarClock, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/g", label: "Home", icon: Home },
  { href: "/g/shifts", label: "My Shifts", icon: CalendarDays },
  { href: "/g/availability", label: "Availability", icon: CalendarClock },
  { href: "/g/notifications", label: "Alerts", icon: Bell },
  { href: "/g/profile", label: "Profile", icon: User },
] as const;

// Routes that render before/outside the signed-in app shell — no nav chrome
// on a sign-in form or a one-time setup link.
const HIDDEN_PREFIXES = ["/g/sign-in", "/g/setup"];

/**
 * Fixed 5-tab bottom navigation for the guard PWA. Lives in app/g/layout.tsx
 * so every screen gets it automatically; pages reserve space for it with the
 * `pb-tabbar` utility (globals.css) instead of a hardcoded padding value.
 */
export function BottomNav() {
  const pathname = usePathname();
  if (!pathname || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  function isActive(href: string) {
    if (href === "/g") return pathname === "/g";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 pb-safe"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5 h-16">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <li key={item.href} className="contents">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[10px] tracking-tight transition-colors",
                  active ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500",
                )}
              >
                <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
                <span className={cn(active && "font-semibold")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
