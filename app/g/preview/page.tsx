"use client";

/**
 * /g/_preview
 *
 * Static visual preview of the redesigned Guard PWA. NOT linked from
 * anywhere. NOT user-facing. Open this URL on your phone to verify the
 * visual direction before any real screen is rewritten.
 *
 * Will be removed once the redesign ships. Mock data only — no DB calls,
 * no auth, no side effects.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, Clock, Calendar, ArrowLeft, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/g/status-pill";
import { CompanyChip } from "@/components/g/company-chip";
import { EmptyState } from "@/components/g/empty-state";
import {
  ShiftCardHero,
  ShiftCardCompact,
  ShiftCardHeroSkeleton,
  ShiftCardCompactSkeleton,
  type ShiftCardData,
} from "@/components/g/shift-card";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Mock data — represents three realistic states
// -----------------------------------------------------------------------------

const AUSWIDE = { id: "co_aus", name: "Auswide Security", brandColour: "#0B1E3F" };
const ACS = { id: "co_acs", name: "ACS Security", brandColour: "#0D9488" };

const todayShift: ShiftCardData = {
  id: "s_today",
  startAt: new Date(Date.now() + 4 * 3600_000 + 22 * 60_000).toISOString(),
  endAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
  status: "PENDING",
  role: "Crowd control",
  site: { name: "Crown Casino", address: "8 Whiteman St, Southbank VIC 3006" },
  company: AUSWIDE,
};

const upcoming: ShiftCardData[] = [
  {
    id: "s_1",
    startAt: new Date(Date.now() + 26 * 3600_000).toISOString(),
    endAt: new Date(Date.now() + 34 * 3600_000).toISOString(),
    status: "PENDING",
    role: null,
    site: { name: "Noble Park Shop", address: "" },
    company: AUSWIDE,
  },
  {
    id: "s_2",
    startAt: new Date(Date.now() + 50 * 3600_000).toISOString(),
    endAt: new Date(Date.now() + 58 * 3600_000).toISOString(),
    status: "CONFIRMED",
    role: null,
    site: { name: "Westfield Doncaster", address: "" },
    company: ACS,
  },
  {
    id: "s_3",
    startAt: new Date(Date.now() + 74 * 3600_000).toISOString(),
    endAt: new Date(Date.now() + 82 * 3600_000).toISOString(),
    status: "PENDING",
    role: null,
    site: { name: "Federation Square", address: "" },
    company: AUSWIDE,
  },
];

// -----------------------------------------------------------------------------
// Layout pieces
// -----------------------------------------------------------------------------

function PreviewFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-3 px-2">
        {title}
      </p>
      <div
        className={cn(
          "mx-auto max-w-md rounded-3xl overflow-hidden",
          "bg-slate-50 dark:bg-slate-900 ring-8 ring-slate-200 dark:ring-slate-800",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function TopBar({ name, subline }: { name: string; subline: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <header className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur px-4 py-3 border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Hi, {name.split(" ")[0]}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subline}</p>
        </div>
        <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-200">
          {initials}
        </div>
      </div>
    </header>
  );
}

function CompanySwitcher({
  options,
  active,
  onPick,
}: {
  options: Array<{ id: string; name: string; brandColour: string }>;
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="px-4 pt-3 pb-1 -mx-1 overflow-x-auto whitespace-nowrap">
      <div className="inline-flex gap-2 px-1">
        <CompanyChip label="All" colour={null} active={active === "all"} onClick={() => onPick("all")} />
        {options.map((c) => (
          <CompanyChip
            key={c.id}
            label={c.name}
            colour={c.brandColour}
            active={active === c.id}
            onClick={() => onPick(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function QuickActions() {
  const items = [
    { icon: AlertTriangle, label: "Report" },
    { icon: Camera, label: "Check-in" },
    { icon: Clock, label: "Timesheets" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 px-4 pt-4">
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl",
            "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
            "py-3 transition active:scale-[0.97]",
          )}
        >
          <it.icon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Mock home — populated (multi-company)
// -----------------------------------------------------------------------------

function MockHomeMulti() {
  const [active, setActive] = React.useState("all");
  return (
    <div className="pb-6">
      <TopBar name="Faisal Mohmand" subline={active === "all" ? "+61 478 835 774" : active === AUSWIDE.id ? "Auswide Security" : "ACS Security"} />
      <CompanySwitcher options={[AUSWIDE, ACS]} active={active} onPick={setActive} />

      <div className="px-4 pt-3">
        <ShiftCardHero shift={todayShift}>
          <div className="flex gap-2">
            <Button className="flex-1 h-10 bg-slate-900 hover:bg-slate-800 text-white">Accept</Button>
            <Button variant="outline" className="flex-1 h-10">
              Decline
            </Button>
          </div>
        </ShiftCardHero>
      </div>

      <QuickActions />

      <div className="px-4 pt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Upcoming</h3>
          <button className="text-xs text-slate-500 dark:text-slate-400">See all →</button>
        </div>
        <ul className="space-y-2">
          {upcoming.map((s) => (
            <ShiftCardCompact key={s.id} shift={s} showCompanyBadge />
          ))}
        </ul>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Mock home — single-company, populated
// -----------------------------------------------------------------------------

function MockHomeSingle() {
  return (
    <div className="pb-6">
      <TopBar name="Faisal Mohmand" subline="+61 478 835 774" />
      <div className="px-4 pt-4">
        <ShiftCardHero shift={{ ...todayShift, company: null }} showCompanyBadge={false}>
          <div className="flex gap-2">
            <Button className="flex-1 h-10 bg-slate-900 hover:bg-slate-800 text-white">Accept</Button>
            <Button variant="outline" className="flex-1 h-10">
              Decline
            </Button>
          </div>
        </ShiftCardHero>
      </div>
      <QuickActions />
      <div className="px-4 pt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Upcoming</h3>
          <button className="text-xs text-slate-500 dark:text-slate-400">See all →</button>
        </div>
        <ul className="space-y-2">
          {upcoming.slice(0, 2).map((s) => (
            <ShiftCardCompact key={s.id} shift={{ ...s, company: null }} />
          ))}
        </ul>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Mock home — empty state
// -----------------------------------------------------------------------------

function MockHomeEmpty() {
  return (
    <div className="pb-6">
      <TopBar name="Faisal Mohmand" subline="+61 478 835 774" />
      <div className="px-4 pt-4">
        <EmptyState
          icon={Calendar}
          title="You're all caught up"
          description="No shifts scheduled. We'll notify you when one's published."
          metaLine="2 shifts last week · Avg response 12 min"
        />
      </div>
      <QuickActions />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Mock home — loading skeleton (rendered before any data arrives)
// -----------------------------------------------------------------------------

function MockHomeSkeleton() {
  return (
    <div className="pb-6">
      <TopBar name="    " subline="" />
      <div className="px-4 pt-4">
        <ShiftCardHeroSkeleton />
      </div>
      <QuickActions />
      <div className="px-4 pt-6">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Upcoming</h3>
        <ul className="space-y-2">
          <ShiftCardCompactSkeleton />
          <ShiftCardCompactSkeleton />
        </ul>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Status pill swatches (for visual reference)
// -----------------------------------------------------------------------------

function StatusSwatches() {
  return (
    <div className="px-4 py-4 flex flex-wrap gap-2 bg-white dark:bg-slate-800">
      <StatusPill status="PENDING" />
      <StatusPill status="CONFIRMED" />
      <StatusPill status="REJECTED" />
      <StatusPill status="WORKED" />
      <StatusPill status="NO_SHOW" />
      <StatusPill status="CANCELLED" />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Root preview page with dark-mode toggle
// -----------------------------------------------------------------------------

export default function PreviewPage() {
  const router = useRouter();
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [dark]);

  return (
    <div className={cn("min-h-screen", dark ? "bg-slate-950" : "bg-slate-100")}>
      <div className="sticky top-0 z-20 flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 bg-slate-100/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => router.push("/g")}
          className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" /> Back to /g
        </button>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Visual preview
        </p>
        <button
          onClick={() => setDark((d) => !d)}
          className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300"
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {dark ? "Light" : "Dark"}
        </button>
      </div>

      <div className="max-w-md mx-auto px-3 py-6">
        <PreviewFrame title="Multi-company home (populated)">
          <MockHomeMulti />
        </PreviewFrame>

        <PreviewFrame title="Single-company home (populated)">
          <MockHomeSingle />
        </PreviewFrame>

        <PreviewFrame title="Empty state">
          <MockHomeEmpty />
        </PreviewFrame>

        <PreviewFrame title="Loading skeleton (first paint)">
          <MockHomeSkeleton />
        </PreviewFrame>

        <PreviewFrame title="Status pill swatches">
          <StatusSwatches />
        </PreviewFrame>
      </div>
    </div>
  );
}
