"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/fetcher";
import { VigiloMark, VigiloWordmark } from "@/components/shell/logo";
import {
  LayoutDashboard,
  Users,
  Building2,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  Settings,
  BadgeCheck,
  LogOut,
  type LucideIcon,
} from "lucide-react";

interface NavItem { href: string; label: string; icon: LucideIcon; badge?: "compliance" }

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/rosters", label: "Rosters", icon: CalendarDays },
    ],
  },
  {
    section: "Workforce",
    items: [
      { href: "/guards", label: "Guards", icon: Users },
      { href: "/compliance", label: "Licences & Compliance", icon: BadgeCheck, badge: "compliance" },
      { href: "/timesheets", label: "Timesheets", icon: ClipboardList },
    ],
  },
  {
    section: "Business",
    items: [{ href: "/sites", label: "Sites", icon: Building2 }],
  },
  {
    section: "Platform",
    items: [
      { href: "/sms-log", label: "SMS Log", icon: MessageSquare },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Shared with the dashboard page, so this costs no extra request there. */
export function useShellStatus() {
  const dash = useQuery<{ kpis: { complianceAlerts?: number } }>({
    queryKey: ["dashboard"],
    queryFn: () => api(`/api/dashboard`),
    staleTime: 30_000,
  });
  const settings = useQuery<{ sms: { configured: boolean } }>({
    queryKey: ["settings"],
    queryFn: () => api(`/api/settings`),
    staleTime: 300_000,
  });
  return {
    complianceAlerts: dash.data?.kpis.complianceAlerts ?? 0,
    smsLive: settings.data?.sms.configured,
  };
}

function SmsStatus({ live }: { live: boolean | undefined }) {
  if (live === undefined) return null;
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground" title={live ? "Twilio is connected" : "Twilio credentials are missing"}>
      <span className={cn("dot", live ? "text-success live" : "text-destructive")} />
      {live ? "SMS gateway live" : "SMS not configured"}
    </span>
  );
}

export function Sidebar({ companyName }: { companyName: string }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { complianceAlerts, smsLive } = useShellStatus();
  const user = session?.user;
  const initials = (user?.name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      {/* Mobile: compact app bar (navigation lives in the bottom tab bar). */}
      <header className="md:hidden sticky top-0 z-30 border-b bg-card pt-safe">
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-2 min-w-0">
            <VigiloMark className="h-5 w-5 shrink-0" />
            <span className="truncate text-sm font-semibold">{companyName}</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Sign out"
            className="p-2 -mr-2 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Desktop top bar */}
      <header className="hidden md:flex sticky top-0 z-40 h-14 items-center justify-between border-b bg-background/95 backdrop-blur px-6 md:ml-60">
        <SmsStatus live={smsLive} />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/20 text-[11px] font-semibold text-foreground ring-1 ring-primary/40">
              {initials}
            </span>
            <span className="leading-tight">
              <span className="block text-[13px] font-medium">{user?.name}</span>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{user?.role}</span>
            </span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="ml-1 rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-50 w-60 flex-col border-r bg-card">
        <Link href="/dashboard" className="flex h-14 items-center gap-2.5 border-b px-5">
          <VigiloMark />
          <VigiloWordmark />
        </Link>
        <div className="border-b px-5 py-3">
          <div className="eyebrow">Company</div>
          <div className="mt-1 truncate text-[13px] font-medium" title={companyName}>{companyName}</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((group) => (
            <div key={group.section} className="mb-4">
              <div className="eyebrow px-5 pb-1.5">{group.section}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const badge = item.badge === "compliance" ? complianceAlerts : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 border-l-[3px] py-2 pl-[17px] pr-4 text-[13px] transition-colors",
                      active
                        ? "border-primary bg-primary/[0.18] font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active && "text-cyan")} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge > 0 && (
                      <span className="num rounded bg-warning/20 px-1.5 text-[10.5px] font-medium leading-4 text-warning">{badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t px-5 py-3">
          <Link href="/m" className="text-xs text-muted-foreground hover:text-foreground" target="_blank">
            Guard app <span className="font-mono">/m</span> ↗
          </Link>
        </div>
      </aside>
    </>
  );
}
