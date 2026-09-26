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
  AlertCircle,
  FileText,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/guards", label: "Guards", icon: Users },
  { href: "/sites", label: "Sites", icon: Building2 },
  { href: "/rosters", label: "Rosters", icon: Calendar },
  { href: "/alarms", label: "Alarms", icon: AlertCircle },
  { href: "/invoices", label: "Invoices", icon: FileText },
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
      <header className="md:hidden sticky top-0 z-30 flex h-12 items-center justify-between border-b border-white/10 bg-brand-navy/95 backdrop-blur text-white px-4 pt-safe shadow-sm">
        <div className="flex items-center gap-2 font-semibold truncate">
          <ShieldCheck className="h-5 w-5 text-brand-amber shrink-0" />
          <span className="truncate">{companyName}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          className="p-2 -mr-2 rounded-lg hover:bg-white/10 active:scale-95"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {/* Desktop top bar */}
      <header className="hidden md:flex sticky top-0 z-40 h-14 items-center justify-between border-b border-white/10 bg-brand-navy/95 backdrop-blur text-white px-4 md:pl-64 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">{companyName}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-brand-amber"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-50 w-64 bg-brand-navy text-white flex-col"
      >
        <div className="flex h-14 items-center px-4 border-b border-white/10">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold group">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-amber/15 text-brand-amber transition-colors group-hover:bg-brand-amber/25">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="tracking-tight">Vigilo</span>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-white/10 text-brand-amber" : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-brand-amber" aria-hidden />
                )}
                <Icon className={cn("h-4 w-4 shrink-0 transition-transform", active && "scale-110")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10 text-xs text-white/50 flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          LIVE — Twilio
        </div>
      </aside>
    </>
  );
}
