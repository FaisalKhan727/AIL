import { toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * Pure data layer for "copy a previous week to a new roster".
 *
 * The UI / API will pull a source roster (with its shifts), the company's
 * guards and sites, and the user's chosen new start date + option flags, then
 * call planCopy() to get back a CopyPlan describing what would be created. No
 * DB writes happen here; persistence is the caller's job.
 *
 * Why this is a separate module:
 *   1. Keeps the calendar / DST / midnight-crossing maths in one place that's
 *      directly testable.
 *   2. Keeps the existing roster builder, publish flow, SMS dispatch etc.
 *      completely untouched. The new feature is a new entry point that
 *      eventually calls existing create-shift code with this plan as input.
 */

// Inputs to the planner -------------------------------------------------------

export interface SourceShift {
  id: string;
  guardId: string | null;
  siteId: string;
  templateId: string | null;
  startAt: Date;
  endAt: Date;
  role: string | null;
  notes: string | null;
}

export interface SourceGuard {
  id: string;
  active: boolean;
  /** When set, any new shift starting on/after this date is treated as
   *  ineligible for this guard and the slot is forced unassigned. */
  licenceExpiry: Date | null;
}

export interface SourceSite {
  id: string;
  active: boolean;
}

export interface CopyOptions {
  /** Carry guard assignments forward. false = every shift becomes
   *  unassigned (placeholder) regardless of guard state. */
  keepGuards: boolean;
  /** Carry over the original notes. */
  keepNotes: boolean;
  /** When the original guard is now inactive, drop the shift instead of
   *  copying it as unassigned. */
  skipInactiveGuards: boolean;
  /** When the site is now inactive, drop the shift instead of copying it
   *  with a warning. */
  skipInactiveSites: boolean;
}

export interface PlanCopyInput {
  shifts: SourceShift[];
  guards: Map<string, SourceGuard>;
  sites: Map<string, SourceSite>;
  /** Calendar days to shift each shift forward (1 week = 7). Negative for
   *  copying older rosters too, though the UI focuses on forward copies. */
  daysOffset: number;
  /** IANA timezone (e.g. "Australia/Melbourne") used so that wall-clock
   *  times are preserved across DST transitions and midnight crossings. */
  timezone: string;
  options: CopyOptions;
}

// Outputs ---------------------------------------------------------------------

export interface PlannedShift {
  sourceShiftId: string;
  guardId: string | null;
  siteId: string;
  templateId: string | null;
  startAt: Date;
  endAt: Date;
  role: string | null;
  notes: string | null;
  /** Reasons surfaced to the operator on the preview screen, e.g.
   *  "guard licence expired", "site currently inactive". */
  warnings: string[];
}

export interface SkippedShift {
  sourceShiftId: string;
  reason: string;
}

export interface CopyPlan {
  planned: PlannedShift[];
  skipped: SkippedShift[];
  sourceShiftCount: number;
  plannedCount: number;
  skippedCount: number;
  unassignedCount: number;
}

// Date helpers ----------------------------------------------------------------

/**
 * Add `daysOffset` calendar days to `d` while preserving the wall-clock time
 * in `tz`. This is what the user means by "the time of day must stay exactly
 * the same, including any shifts that cross midnight ... handle DST correctly":
 * the answer should be "the same wall time, that many calendar days later",
 * not "exactly N * 86400000 ms later".
 */
export function shiftDateInTz(d: Date, daysOffset: number, tz: string): Date {
  const local = toZonedTime(d, tz);
  const shifted = new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() + daysOffset,
    local.getHours(),
    local.getMinutes(),
    local.getSeconds(),
    local.getMilliseconds(),
  );
  return fromZonedTime(shifted, tz);
}

/**
 * Calendar-day distance between two UTC Dates as observed in `tz`.
 * Handy for the UI: caller can compute daysOffset = calendarDayDiff(sourceStart, newStart, tz).
 */
export function calendarDayDiff(from: Date, to: Date, tz: string): number {
  const fromLocal = toZonedTime(from, tz);
  const toLocal = toZonedTime(to, tz);
  const fromDay = new Date(fromLocal.getFullYear(), fromLocal.getMonth(), fromLocal.getDate());
  const toDay = new Date(toLocal.getFullYear(), toLocal.getMonth(), toLocal.getDate());
  return Math.round((toDay.getTime() - fromDay.getTime()) / 86_400_000);
}

// Planner ---------------------------------------------------------------------

export function planCopy(input: PlanCopyInput): CopyPlan {
  const { shifts, guards, sites, daysOffset, timezone, options } = input;

  const planned: PlannedShift[] = [];
  const skipped: SkippedShift[] = [];

  for (const s of shifts) {
    const newStart = shiftDateInTz(s.startAt, daysOffset, timezone);
    const newEnd = shiftDateInTz(s.endAt, daysOffset, timezone);

    const site = sites.get(s.siteId);
    if (!site) {
      skipped.push({ sourceShiftId: s.id, reason: "site no longer exists" });
      continue;
    }
    if (!site.active && options.skipInactiveSites) {
      skipped.push({ sourceShiftId: s.id, reason: "site is now inactive" });
      continue;
    }

    const warnings: string[] = [];
    if (!site.active) warnings.push("site is currently inactive");

    let guardId: string | null = options.keepGuards ? s.guardId : null;

    if (guardId) {
      const guard = guards.get(guardId);
      if (!guard) {
        // The guard was hard-deleted between source and now.
        if (options.skipInactiveGuards) {
          skipped.push({ sourceShiftId: s.id, reason: "original guard no longer exists" });
          continue;
        }
        guardId = null;
        warnings.push("original guard no longer exists — placeholder created");
      } else {
        if (!guard.active) {
          if (options.skipInactiveGuards) {
            skipped.push({ sourceShiftId: s.id, reason: "original guard is now inactive" });
            continue;
          }
          guardId = null;
          warnings.push("original guard is now inactive — placeholder created");
        } else if (guard.licenceExpiry && guard.licenceExpiry.getTime() < newStart.getTime()) {
          // Licence has expired by the new shift's start. The shift is still
          // copied (the operator wants to see what slot needs filling), but it
          // becomes a placeholder regardless of keepGuards.
          guardId = null;
          warnings.push("original guard's licence will be expired by the new shift date");
        }
      }
    }

    planned.push({
      sourceShiftId: s.id,
      guardId,
      siteId: s.siteId,
      // Keep templateId so the new shift is still associated with the original
      // template, even if that template's wall-clock times have since drifted.
      templateId: s.templateId,
      startAt: newStart,
      endAt: newEnd,
      role: s.role,
      notes: options.keepNotes ? s.notes : null,
      warnings,
    });
  }

  const unassignedCount = planned.filter((p) => p.guardId === null).length;
  return {
    planned,
    skipped,
    sourceShiftCount: shifts.length,
    plannedCount: planned.length,
    skippedCount: skipped.length,
    unassignedCount,
  };
}
