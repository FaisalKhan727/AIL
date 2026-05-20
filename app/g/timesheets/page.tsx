"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/g/skeleton";
import { CompanyChip } from "@/components/g/company-chip";
import { EmptyState } from "@/components/g/empty-state";
import { companyColour } from "@/lib/g/design";

interface Membership {
  guardId: string;
  companyId: string;
  companyName: string;
  companyBrandColour: string | null;
}

interface MeResponse {
  identity: { firstName: string; phone: string };
  memberships: Membership[];
}

interface ShiftRow {
  id: string;
  startAt: string;
  endAt: string;
  workedStart: string | null;
  workedEnd: string | null;
  status: string;
  hours: number;
  pay: number;
  siteName: string;
  company: { id: string; name: string; brandColour: string | null };
}

interface WeekRow {
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  totalPay: number;
  shifts: ShiftRow[];
}

const ACTIVE_COMPANY_KEY = "vg_active_company";

function fmtCurrency(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
}

function fmtWeekRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(s)} – ${fmt(e)}`;
}

function fmtDayTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export default function GuardTimesheetsPage() {
  const router = useRouter();
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [weeks, setWeeks] = React.useState<WeekRow[] | null>(null);
  const [activeCompany, setActiveCompany] = React.useState<string>("all");

  // 1. Identity + memberships
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/g/me");
        if (res.status === 401) {
          router.replace("/g/sign-in");
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as MeResponse;
        setMe(json);
        const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_COMPANY_KEY) : null;
        if (stored && (stored === "all" || json.memberships.some((m) => m.companyId === stored))) {
          setActiveCompany(stored);
        } else if (json.memberships.length === 1) {
          setActiveCompany(json.memberships[0].companyId);
        } else {
          setActiveCompany("all");
        }
      } catch {
        /* swallow */
      }
    })();
  }, [router]);

  // 2. Timesheets (re-fetched when active company changes)
  React.useEffect(() => {
    if (!me) return;
    (async () => {
      setWeeks(null);
      try {
        const q = activeCompany === "all" ? "" : `?companyId=${encodeURIComponent(activeCompany)}`;
        const res = await fetch(`/api/g/timesheets${q}`);
        const json = await res.json();
        if (res.ok) setWeeks(json.weeks ?? []);
      } catch {
        setWeeks([]);
      }
    })();
  }, [me, activeCompany]);

  // 3. Persist active company
  React.useEffect(() => {
    if (me && typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_COMPANY_KEY, activeCompany);
    }
  }, [me, activeCompany]);

  const isMultiCompany = (me?.memberships.length ?? 0) > 1;

  const grandHours = weeks?.reduce((a, w) => a + w.totalHours, 0) ?? 0;
  const grandPay = weeks?.reduce((a, w) => a + w.totalPay, 0) ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-8">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/g")}
            className="p-1 -ml-1 rounded-md active:scale-95 transition"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </button>
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Timesheets</h1>
        </div>
      </header>

      {/* Company switcher */}
      {isMultiCompany && me && (
        <div className="px-4 pt-3 pb-1 -mx-1 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex gap-2 px-1">
            <CompanyChip label="All" colour={null} active={activeCompany === "all"} onClick={() => setActiveCompany("all")} />
            {me.memberships.map((m) => (
              <CompanyChip
                key={m.companyId}
                label={m.companyName}
                colour={m.companyBrandColour}
                active={activeCompany === m.companyId}
                onClick={() => setActiveCompany(m.companyId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Grand totals */}
      {weeks !== null && weeks.length > 0 && (
        <div className="px-4 pt-3">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Last 12 weeks
            </p>
            <div className="flex items-baseline gap-4">
              <div>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{grandHours.toFixed(1)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">hours</p>
              </div>
              <div className="flex-1 text-right">
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{fmtCurrency(grandPay)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">total pay</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Week list */}
      <div className="px-4 pt-4 space-y-3">
        {weeks === null ? (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </>
        ) : weeks.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No timesheet data yet"
            description="Once your shifts are confirmed or worked, they'll appear here grouped by week."
          />
        ) : (
          weeks.map((w, idx) => (
            <WeekCard
              key={w.weekStart}
              week={w}
              showCompanyBadge={isMultiCompany && activeCompany === "all"}
              isCurrent={idx === 0}
            />
          ))
        )}
      </div>

      {/* Footnote */}
      {weeks && weeks.length > 0 && (
        <div className="px-4 pt-4">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
            Hours use Clock-in / Clock-out if recorded, otherwise scheduled time.
            Pay rate from your guard profile per company.
          </p>
        </div>
      )}
    </div>
  );
}

function WeekCard({
  week,
  showCompanyBadge,
  isCurrent,
}: {
  week: WeekRow;
  showCompanyBadge: boolean;
  isCurrent: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
        isCurrent && "shadow-sm",
      )}
    >
      <header className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {fmtWeekRange(week.weekStart, week.weekEnd)}
          </span>
          {isCurrent && (
            <span className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200">
              This week
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-tight">
            {week.totalHours.toFixed(1)}h
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">
            {fmtCurrency(week.totalPay)}
          </p>
        </div>
      </header>
      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {week.shifts.map((s) => (
          <li key={s.id} className="px-4 py-2.5 flex items-start gap-3">
            <span
              className="h-2 w-2 rounded-full mt-1.5 shrink-0"
              style={{ backgroundColor: companyColour(s.company.brandColour, s.company.id) }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm text-slate-900 dark:text-slate-100 truncate">
                  {s.siteName}
                </p>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 shrink-0">
                  {s.hours.toFixed(1)}h
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">{fmtDayTime(s.startAt)}</span>
                <span className="shrink-0">{fmtCurrency(s.pay)}</span>
              </div>
              {showCompanyBadge && (
                <p className="text-[10px] uppercase tracking-wider font-medium text-slate-400 dark:text-slate-500 mt-0.5">
                  {s.company.name} · {s.status}
                </p>
              )}
              {!showCompanyBadge && s.status === "CONFIRMED" && (
                <p className="text-[10px] uppercase tracking-wider font-medium text-slate-400 dark:text-slate-500 mt-0.5">
                  Scheduled (not yet worked)
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
