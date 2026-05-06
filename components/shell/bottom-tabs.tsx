"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Calendar,
  MoreHorizontal,
  ClipboardList,
  MessageSquare,
  Settings,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/rosters",   label: "Rosters", icon: Calendar },
  { href: "/guards",    label: "Guards",  icon: Users },
  { href: "/sites",     label: "Sites",   icon: Building2 },
] as const;

const MORE = [
  { href: "/timesheets", label: "Timesheets", icon: ClipboardList },
  { href: "/sms-log",    label: "SMS Log",    icon: MessageSquare },
  { href: "/settings",   label: "Settings",   icon: Settings },
] as const;

export function BottomTabs() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);

  React.useEffect(() => { setMoreOpen(false); }, [pathname]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }
  const moreActive = MORE.some((m) => isActive(m.href));

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 md:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      )}
      {moreOpen && (
        <div
          role="dialog"
          aria-label="More menu"
          className="fixed inset-x-0 bottom-0 z-50 md:hidden bg-background border-t rounded-t-2xl shadow-2xl pb-safe"
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <span className="text-base font-semibold">More</span>
            <button
              onClick={() => setMoreOpen(false)}
              className="rounded-full p-2 hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="px-2 pb-2">
            {MORE.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-base",
                    active
                      ? "bg-muted text-brand-navy font-medium"
                      : "text-foreground/80 hover:bg-muted/60",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-base text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-5 w-5" />
              Sign out
            </button>
          </nav>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 md:hidden bg-background border-t pb-safe"
        aria-label="Primary"
      >
        <ul className="grid grid-cols-5 h-16">
          {PRIMARY.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href} className="contents">
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 text-[11px] tracking-tight",
                    active ? "text-brand-navy" : "text-muted-foreground",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "text-brand-amber")} />
                  <span className={cn(active && "font-semibold")}>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="contents">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[11px] tracking-tight",
                moreActive ? "text-brand-navy" : "text-muted-foreground",
              )}
            >
              <MoreHorizontal className={cn("h-5 w-5", moreActive && "text-brand-amber")} />
              <span className={cn(moreActive && "font-semibold")}>More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
