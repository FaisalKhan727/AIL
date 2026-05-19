"use client";

import { MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { companyColour, timeUntil, type ShiftStatus } from "@/lib/g/design";
import { StatusPill } from "./status-pill";

export interface ShiftCardData {
  id: string;
  startAt: string | Date;
  endAt: string | Date;
  status: ShiftStatus;
  role: string | null;
  site: { name: string; address: string };
  company?: { id: string; name: string; brandColour: string | null } | null;
}

function formatDateLine(start: Date, end: Date): string {
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const dayLabel = sameDay(start, now)
    ? "Today"
    : sameDay(start, new Date(now.getTime() + 86400000))
      ? "Tomorrow"
      : start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dayLabel} ${fmtTime(start)} – ${fmtTime(end)}`;
}

// -----------------------------------------------------------------------------
// Hero card — the big "today's shift" card on the home screen
// -----------------------------------------------------------------------------

interface HeroProps {
  shift: ShiftCardData;
  showCompanyBadge?: boolean;
  children?: React.ReactNode; // action button row
  onTap?: () => void;
}

export function ShiftCardHero({ shift, showCompanyBadge = true, children, onTap }: HeroProps) {
  const start = new Date(shift.startAt);
  const end = new Date(shift.endAt);
  const stripe = companyColour(shift.company?.brandColour, shift.company?.id);

  return (
    <div
      onClick={onTap}
      className={cn(
        "relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800",
        "border border-slate-200 dark:border-slate-700 shadow-sm",
        "transition active:scale-[0.99]",
        onTap && "cursor-pointer",
      )}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{ backgroundColor: stripe }}
        aria-hidden
      />
      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          {showCompanyBadge && shift.company ? (
            <span
              className="inline-flex items-center text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: stripe }}
            >
              {shift.company.name}
            </span>
          ) : (
            <span aria-hidden />
          )}
          <StatusPill status={shift.status} size="sm" />
        </div>

        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
          {shift.site.name}
        </h2>
        <p className="mt-1 text-base text-slate-800 dark:text-slate-200">
          {formatDateLine(start, end)}
        </p>

        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{shift.site.address}</span>
        </div>

        {start.getTime() > Date.now() && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Starts {timeUntil(start)}</span>
          </div>
        )}

        {shift.role && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{shift.role}</p>
        )}

        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Compact card — used in upcoming list & shift list page
// -----------------------------------------------------------------------------

interface CompactProps {
  shift: ShiftCardData;
  showCompanyBadge?: boolean;
  onTap?: () => void;
}

export function ShiftCardCompact({ shift, showCompanyBadge = false, onTap }: CompactProps) {
  const start = new Date(shift.startAt);
  const end = new Date(shift.endAt);
  const stripe = companyColour(shift.company?.brandColour, shift.company?.id);

  return (
    <li
      onClick={onTap}
      className={cn(
        "relative overflow-hidden rounded-xl bg-white dark:bg-slate-800",
        "border border-slate-200 dark:border-slate-700",
        "transition active:scale-[0.99]",
        onTap && "cursor-pointer",
      )}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: stripe }}
        aria-hidden
      />
      <div className="pl-3.5 pr-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">
              {shift.site.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatDateLine(start, end)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {showCompanyBadge && shift.company && (
              <span
                className="inline-flex items-center text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded text-white"
                style={{ backgroundColor: stripe }}
              >
                {shift.company.name}
              </span>
            )}
            <StatusPill status={shift.status} size="sm" />
          </div>
        </div>
      </div>
    </li>
  );
}

// -----------------------------------------------------------------------------
// Skeleton variants — render while data is loading
// -----------------------------------------------------------------------------

export function ShiftCardHeroSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
      <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-slate-200 dark:bg-slate-700" />
      <div className="pl-5 pr-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-skeleton-pulse" />
          <div className="h-4 w-16 rounded-full bg-slate-200 dark:bg-slate-700 animate-skeleton-pulse" />
        </div>
        <div className="h-5 w-2/3 rounded bg-slate-200 dark:bg-slate-700 animate-skeleton-pulse" />
        <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700 animate-skeleton-pulse" />
        <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700 animate-skeleton-pulse" />
        <div className="flex gap-2 pt-2">
          <div className="h-9 flex-1 rounded-lg bg-slate-200 dark:bg-slate-700 animate-skeleton-pulse" />
          <div className="h-9 flex-1 rounded-lg bg-slate-200 dark:bg-slate-700 animate-skeleton-pulse" />
        </div>
      </div>
    </div>
  );
}

export function ShiftCardCompactSkeleton() {
  return (
    <li className="relative overflow-hidden rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      <span className="absolute left-0 top-0 bottom-0 w-1 bg-slate-200 dark:bg-slate-700" />
      <div className="pl-3.5 pr-3 py-2.5 flex items-center justify-between">
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-2/3 rounded bg-slate-200 dark:bg-slate-700 animate-skeleton-pulse" />
          <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700 animate-skeleton-pulse" />
        </div>
        <div className="h-4 w-14 rounded-full bg-slate-200 dark:bg-slate-700 animate-skeleton-pulse" />
      </div>
    </li>
  );
}
