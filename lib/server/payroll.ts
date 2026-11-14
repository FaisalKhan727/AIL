import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fromZonedTime } from "date-fns-tz";
import { APP_TZ } from "@/lib/date";
import { calculatePay, normaliseRules, paidMinutes, timesheetFlags, type PayFrequency, type PayRules } from "@/lib/payroll";

export interface PaySettings {
  rules: PayRules;
  frequency: PayFrequency;
  anchor: string; // yyyy-MM-dd that started a pay period
  tz: string;
}

const DEFAULT_ANCHOR = "2026-01-05"; // a Monday

export async function getPaySettings(companyId: string): Promise<PaySettings> {
  const rows = await prisma.setting.findMany({
    where: { companyId, key: { in: ["pay_rules", "pay_frequency", "pay_anchor", "timezone"] } },
  });
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let parsed: unknown = {};
  try { parsed = v.pay_rules ? JSON.parse(v.pay_rules) : {}; } catch { /* fall back to defaults */ }
  return {
    rules: normaliseRules(parsed),
    frequency: v.pay_frequency === "FORTNIGHTLY" ? "FORTNIGHTLY" : "WEEKLY",
    anchor: /^\d{4}-\d{2}-\d{2}$/.test(v.pay_anchor ?? "") ? v.pay_anchor : DEFAULT_ANCHOR,
    tz: v.timezone || APP_TZ,
  };
}

export async function holidaySet(companyId: string): Promise<Set<string>> {
  const rows = await prisma.publicHoliday.findMany({ where: { companyId }, select: { date: true } });
  return new Set(rows.map((h) => h.date.toISOString().slice(0, 10)));
}

/** UTC instants bounding the local calendar dates [start, end] in tz. */
export function periodBounds(start: string, end: string, tz: string) {
  const from = fromZonedTime(`${start}T00:00:00`, tz);
  const next = new Date(`${end}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const to = fromZonedTime(`${next.toISOString().slice(0, 10)}T00:00:00`, tz);
  return { from, to };
}

export const timesheetInclude = {
  guard: { select: { id: true, firstName: true, lastName: true, employmentType: true, payRate: true } },
  site: { select: { id: true, name: true, clientId: true } },
  payRun: { select: { id: true, number: true, status: true } },
} satisfies Prisma.ShiftInclude;
type TsRow = Prisma.ShiftGetPayload<{ include: typeof timesheetInclude }>;

/** Effective times on a timesheet: what was worked if known, else the roster. */
export function actualTimes(s: { startAt: Date; endAt: Date; workedStart: Date | null; workedEnd: Date | null; clockOutAt: Date | null }) {
  return { start: s.workedStart ?? s.startAt, end: s.workedEnd ?? s.endAt };
}

export function serialiseTimesheet(s: TsRow, now: Date = new Date()) {
  const { start, end } = actualTimes(s);
  return {
    id: s.id,
    guardId: s.guardId,
    guardName: s.guard ? `${s.guard.firstName} ${s.guard.lastName}` : "Unassigned",
    siteName: s.site.name,
    role: s.role,
    rosteredStart: s.startAt,
    rosteredEnd: s.endAt,
    clockInAt: s.clockInAt,
    clockOutAt: s.clockOutAt,
    start,
    end,
    source: s.clockInAt ? "CLOCK" : s.workedStart ? "EDITED" : "ROSTER",
    breakMins: s.breakMins,
    hours: Math.round((paidMinutes({ start, end, breakMins: s.breakMins }) / 60) * 100) / 100,
    status: s.tsStatus,
    note: s.tsNote,
    approvedBy: s.tsApprovedBy,
    approvedAt: s.tsApprovedAt,
    flags: timesheetFlags(s, now),
    payRun: s.payRun,
    invoiced: Boolean(s.invoiceId),
  };
}

export type PayRunWithLines = Prisma.PayRunGetPayload<{ include: { lines: true } }>;

/**
 * Calculate lines for the approved, unpaid shifts handed in, grouped by guard.
 * Returns the guards that couldn't be paid (no pay rate) separately so the
 * caller can tell the admin rather than silently skipping them.
 */
export async function buildLines(companyId: string, shiftIds: string[]) {
  const settings = await getPaySettings(companyId);
  const holidays = await holidaySet(companyId);
  const shifts = await prisma.shift.findMany({
    where: { id: { in: shiftIds } },
    include: { guard: true },
  });
  const byGuard = new Map<string, typeof shifts>();
  for (const s of shifts) if (s.guardId) byGuard.set(s.guardId, [...(byGuard.get(s.guardId) ?? []), s]);

  const lines: Prisma.PayRunLineCreateManyPayRunInput[] = [];
  const missingRate: string[] = [];
  for (const [guardId, list] of byGuard) {
    const g = list[0].guard!;
    const rate = g.payRate ? Number(g.payRate) : 0;
    if (!rate) { missingRate.push(`${g.firstName} ${g.lastName}`); continue; }
    const pay = calculatePay(
      list.map((s) => ({ id: s.id, ...actualTimes(s), breakMins: s.breakMins })),
      { employmentType: g.employmentType, baseRate: rate },
      settings.rules,
      holidays,
      settings.tz,
    );
    for (const l of pay) {
      lines.push({
        guardId,
        shiftId: l.shiftId,
        workDate: new Date(`${l.workDate}T00:00:00.000Z`),
        category: l.category,
        hours: Math.round((l.minutes / 60) * 10000) / 10000,
        baseRate: rate,
        multiplier: l.multiplier,
        amount: l.amount,
        superable: l.superable,
      });
    }
  }
  return { lines, missingRate, settings };
}
