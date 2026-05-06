"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Building2,
  Calendar,
  ClipboardList,
  MessageSquare,
  Settings,
  ShieldCheck,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/guards", label: "Guards", icon: Users },
  { href: "/sites", label: "Sites", icon: Building2 },
  { href: "/rosters", label: "Rosters", icon: Calendar },
  { href: "/timesheets", label: "Timesheets", icon: ClipboardList },
  { href: "/sms-log", label: "SMS Log", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ companyName }: { companyName: string }) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile: compact app bar with company name and sign-out (nav lives in
          the bottom tab bar). */}
      <header className="md:hidden sticky top-0 z-30 flex h-12 items-center justify-between border-b bg-brand-navy text-white px-4 pt-safe">
        <div className="flex items-center gap-2 font-semibold truncate">
          <ShieldCheck className="h-5 w-5 text-brand-amber shrink-0" />
          <span className="truncate">{companyName}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          className="p-2 -mr-2 rounded hover:bg-white/10"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {/* Desktop top bar */}
      <header className="hidden md:flex sticky top-0 z-40 h-14 items-center justify-between border-b bg-brand-navy text-white px-4 md:pl-64">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{companyName}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 text-sm hover:text-brand-amber"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-50 w-64 bg-brand-navy text-white flex-col"
      >
        <div className="flex h-14 items-center px-4 border-b border-white/10">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 text-brand-amber" />
            <span>Vigilo</span>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  active ? "bg-white/10 text-brand-amber" : "text-white/80 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10 text-xs text-white/50">
          LIVE — Twilio
        </div>
      </aside>
    </>
  );
}
