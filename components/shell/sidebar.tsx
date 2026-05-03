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
  PlayCircle,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/guards", label: "Guards", icon: Users },
  { href: "/sites", label: "Sites", icon: Building2 },
  { href: "/rosters", label: "Rosters", icon: Calendar },
  { href: "/timesheets", label: "Timesheets", icon: ClipboardList },
  { href: "/sms-log", label: "SMS Log", icon: MessageSquare },
  { href: "/sms-simulator", label: "SMS Simulator", icon: PlayCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ companyName }: { companyName: string }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-brand-navy text-white px-4 md:pl-64">
        <div className="flex items-center gap-2 md:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-1 rounded hover:bg-white/10">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold">{companyName}</span>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <span className="font-semibold">{companyName}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 text-sm hover:text-brand-amber"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 md:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-brand-navy text-white flex flex-col transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between px-4 border-b border-white/10">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 text-brand-amber" />
            <span>Vigilo</span>
          </Link>
          <button onClick={() => setOpen(false)} className="md:hidden p-1 rounded hover:bg-white/10" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
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
          {process.env.NEXT_PUBLIC_SMS_MODE === "twilio" ? "LIVE — Twilio" : "MOCK MODE"}
        </div>
      </aside>
    </>
  );
}
