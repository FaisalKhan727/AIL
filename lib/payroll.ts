// Pay calculation. Pure: no database, no network.
//
// A shift is split at local midnight and at the night-band boundaries, each
// piece is classified (public holiday > Sunday > Saturday > night >
// ordinary), the unpaid break is taken out pro rata, and anything past the
// daily or weekly overtime threshold is moved to overtime from the end of
// the shift backwards. Every rate is a multiple of the guard's base hourly
// rate; casual multipliers include the casual loading.
//
// Defaults follow the Security Services Industry Award 2020 (MA000016):
// weekday 6pm–6am 121.7% (casual 146.7%), Saturday 150/175%, Sunday
// 200/225%, public holiday 250/275%, overtime 150% for two hours then 200%
// (Sunday 200%, public holiday 250%). Casual overtime rates and the 130%
// permanent-night loading (cl. 20.3) are not modelled from a confirmed
// source; every number is a company setting and must be checked against the
// current award before anyone is paid.

import { toZonedTime } from "date-fns-tz";

export const CATEGORIES = [
  "ORDINARY",
  "NIGHT",
  "SATURDAY",
  "SUNDAY",
  "PUBLIC_HOLIDAY",
  "OT_150",
  "OT_200",
  "OT_SUNDAY",
  "OT_PUBLIC_HOLIDAY",
  "ADJUSTMENT",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  ORDINARY: "Ordinary hours",
  NIGHT: "Night shift",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
  PUBLIC_HOLIDAY: "Public holiday",
  OT_150: "Overtime (first 2 hours)",
  OT_200: "Overtime (after 2 hours)",
  OT_SUNDAY: "Overtime (Sunday)",
  OT_PUBLIC_HOLIDAY: "Overtime (public holiday)",
  ADJUSTMENT: "Adjustment",
};

export type RateTable = Record<Exclude<Category, "ADJUSTMENT">, number>;

export interface PayRules {
  /** Superannuation guarantee, % of ordinary time earnings (qualifying
   *  earnings from 1 July 2026, which still exclude award overtime). */
  superRate: number;
  /** Local "HH:mm". Weekday hours inside this band are paid as NIGHT. */
  nightStart: string;
  nightEnd: string;
  /** Paid hours in one shift after which the rest is overtime. */
  dailyOtHours: number;
  /** Ordinary hours per Monday–Sunday week after which the rest is overtime. */
  weeklyOtHours: number;
  /** Whether the weekly threshold applies to casual guards. */
  weeklyOtCasual: boolean;
  permanent: RateTable;
  casual: RateTable;
}

export const DEFAULT_RULES: PayRules = {
  superRate: 12,
  nightStart: "18:00",
  nightEnd: "06:00",
  // Award cl. 13.3(c): at most 10 ordinary hours a shift (12 by agreement).
  dailyOtHours: 10,
  weeklyOtHours: 38,
  weeklyOtCasual: true,
  permanent: {
    ORDINARY: 1,
    NIGHT: 1.217,
    SATURDAY: 1.5,
    SUNDAY: 2,
    PUBLIC_HOLIDAY: 2.5,
    OT_150: 1.5,
    OT_200: 2,
    OT_SUNDAY: 2,
    OT_PUBLIC_HOLIDAY: 2.5,
  },
  casual: {
    ORDINARY: 1.25,
    NIGHT: 1.467,
    SATURDAY: 1.75,
    SUNDAY: 2.25,
    PUBLIC_HOLIDAY: 2.75,
    OT_150: 1.75,
    OT_200: 2.25,
    OT_SUNDAY: 2.25,
    OT_PUBLIC_HOLIDAY: 2.75,
  },
};

/** Merge stored settings over the defaults, dropping anything malformed. */
export function normaliseRules(raw: unknown): PayRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PayRules>;
  const num = (v: unknown, d: number, min = 0, max = 100) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : d;
  const time = (v: unknown, d: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
  const table = (t: unknown, d: RateTable): RateTable => {
    const o = (t && typeof t === "object" ? t : {}) as Partial<RateTable>;
    const out = { ...d };
    for (const k of Object.keys(d) as (keyof RateTable)[]) out[k] = num(o[k], d[k], 0, 10);
    return out;
  };
  return {
    superRate: num(r.superRate, DEFAULT_RULES.superRate, 0, 30),
    nightStart: time(r.nightStart, DEFAULT_RULES.nightStart),
    nightEnd: time(r.nightEnd, DEFAULT_RULES.nightEnd),
    dailyOtHours: num(r.dailyOtHours, DEFAULT_RULES.dailyOtHours, 1, 24),
    weeklyOtHours: num(r.weeklyOtHours, DEFAULT_RULES.weeklyOtHours, 1, 168),
    weeklyOtCasual: typeof r.weeklyOtCasual === "boolean" ? r.weeklyOtCasual : DEFAULT_RULES.weeklyOtCasual,
    permanent: table(r.permanent, DEFAULT_RULES.permanent),
    casual: table(r.casual, DEFAULT_RULES.casual),
  };
}

export const SUPERABLE: Record<Category, boolean> = {
  ORDINARY: true,
  NIGHT: true,
  SATURDAY: true,
  SUNDAY: true,
  PUBLIC_HOLIDAY: true,
  OT_150: false,
  OT_200: false,
  OT_SUNDAY: false,
  OT_PUBLIC_HOLIDAY: false,
  ADJUSTMENT: false,
};

export interface TimesheetShift {
  id: string;
  start: Date; // actual (or rostered) start
  end: Date;
  breakMins: number;
}

export interface PayLine {
  shiftId: string;
  workDate: string; // yyyy-MM-dd, local
  category: Category;
  minutes: number;
  multiplier: number;
  amount: number;
  superable: boolean;
}

const MIN = 60_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

/** Paid hours on a timesheet: elapsed time less the unpaid break, never negative. */
export function paidMinutes(s: { start: Date; end: Date; breakMins: number }): number {
  const elapsed = Math.round((s.end.getTime() - s.start.getTime()) / MIN);
  return Math.max(0, elapsed - Math.max(0, s.breakMins));
}

interface Piece {
  start: number; // epoch ms
  minutes: number;
  date: string; // local yyyy-MM-dd
  base: "ORDINARY" | "NIGHT" | "SATURDAY" | "SUNDAY" | "PUBLIC_HOLIDAY";
}

function hhmm(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function inNight(localMinutes: number, startM: number, endM: number): boolean {
  if (startM === endM) return false;
  return startM < endM ? localMinutes >= startM && localMinutes < endM : localMinutes >= startM || localMinutes < endM;
}

/**
 * Split [start, end) into pieces on a 30-minute UTC grid (which lands on every
 * local hour and half hour in every Australian time zone), merge neighbours
 * with the same local date and class, then classify each.
 */
function pieces(shift: TimesheetShift, rules: PayRules, holidays: Set<string>, tz: string): Piece[] {
  const out: Piece[] = [];
  const startMs = shift.start.getTime();
  const endMs = shift.end.getTime();
  if (endMs <= startMs) return out;
  const nightS = hhmm(rules.nightStart);
  const nightE = hhmm(rules.nightEnd);
  const GRID = 30 * MIN;
  let t = startMs;
  while (t < endMs) {
    const next = Math.min(endMs, (Math.floor(t / GRID) + 1) * GRID);
    const local = toZonedTime(new Date(t), tz);
    const date = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
    const dow = local.getDay();
    const lm = local.getHours() * 60 + local.getMinutes();
    const base: Piece["base"] = holidays.has(date)
      ? "PUBLIC_HOLIDAY"
      : dow === 0
        ? "SUNDAY"
        : dow === 6
          ? "SATURDAY"
          : inNight(lm, nightS, nightE)
            ? "NIGHT"
            : "ORDINARY";
    const minutes = (next - t) / MIN;
    const prev = out[out.length - 1];
    if (prev && prev.date === date && prev.base === base) prev.minutes += minutes;
    else out.push({ start: t, minutes, date, base });
    t = next;
  }
  return out;
}

/** Take the unpaid break out of the pieces pro rata, keeping whole minutes. */
function deductBreak(ps: Piece[], breakMins: number): Piece[] {
  const total = ps.reduce((n, p) => n + p.minutes, 0);
  const brk = Math.min(Math.max(0, breakMins), total);
  if (!brk || !total) return ps;
  let remaining = brk;
  const out = ps.map((p, i) => {
    const share = i === ps.length - 1 ? remaining : Math.min(remaining, Math.round((p.minutes / total) * brk));
    remaining -= share;
    return { ...p, minutes: p.minutes - share };
  });
  return out.filter((p) => p.minutes > 0);
}

/** Monday (local) of the week a yyyy-MM-dd date falls in. */
export function weekKey(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/**
 * Calculate pay lines for one guard. Shifts may arrive in any order; they are
 * processed by start time so the weekly overtime threshold is applied in the
 * order the hours were worked.
 */
export function calculatePay(
  shifts: TimesheetShift[],
  guard: { employmentType: string; baseRate: number },
  rules: PayRules,
  holidays: Set<string>,
  tz: string,
): PayLine[] {
  const table = guard.employmentType === "CASUAL" ? rules.casual : rules.permanent;
  const weekly = guard.employmentType !== "CASUAL" || rules.weeklyOtCasual;
  const weekOrdinary = new Map<string, number>();
  const lines: PayLine[] = [];

  for (const shift of [...shifts].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const ps = deductBreak(pieces(shift, rules, holidays, tz), shift.breakMins);
    const paid = ps.reduce((n, p) => n + p.minutes, 0);
    if (!paid) continue;

    const wk = weekKey(ps[0].date);
    const used = weekOrdinary.get(wk) ?? 0;
    const dailyCap = rules.dailyOtHours * 60;
    const weeklyRoom = weekly ? Math.max(0, rules.weeklyOtHours * 60 - used) : Infinity;
    const ordinary = Math.min(paid, dailyCap, weeklyRoom);
    weekOrdinary.set(wk, used + ordinary);

    // Peel overtime minutes off the end of the shift.
    let ot = paid - ordinary;
    const otPieces: Piece[] = [];
    for (let i = ps.length - 1; i >= 0 && ot > 0; i--) {
      const take = Math.min(ot, ps[i].minutes);
      ps[i].minutes -= take;
      otPieces.unshift({ ...ps[i], minutes: take });
      ot -= take;
    }

    const push = (date: string, category: Category, minutes: number) => {
      if (minutes <= 0) return;
      const existing = lines.find((l) => l.shiftId === shift.id && l.workDate === date && l.category === category);
      if (existing) existing.minutes += minutes;
      else lines.push({ shiftId: shift.id, workDate: date, category, minutes, multiplier: 0, amount: 0, superable: SUPERABLE[category] });
    };

    for (const p of ps) push(p.date, p.base, p.minutes);
    // The first two hours of ordinary-day overtime in a shift are at the lower rate.
    let firstTwo = 120;
    for (const p of otPieces) {
      if (p.base === "PUBLIC_HOLIDAY") push(p.date, "OT_PUBLIC_HOLIDAY", p.minutes);
      else if (p.base === "SUNDAY") push(p.date, "OT_SUNDAY", p.minutes);
      else {
        const low = Math.min(firstTwo, p.minutes);
        push(p.date, "OT_150", low);
        push(p.date, "OT_200", p.minutes - low);
        firstTwo -= low;
      }
    }
  }

  for (const l of lines) {
    l.multiplier = table[l.category as keyof RateTable];
    l.amount = round2((l.minutes / 60) * guard.baseRate * l.multiplier);
  }
  return lines;
}

export function payTotals(lines: { amount: number; superable: boolean; minutes?: number; hours?: number }[], superRate: number) {
  const gross = round2(lines.reduce((n, l) => n + l.amount, 0));
  const ote = round2(lines.filter((l) => l.superable).reduce((n, l) => n + l.amount, 0));
  const hours = round2(lines.reduce((n, l) => n + (l.hours ?? (l.minutes ?? 0) / 60), 0));
  return { gross, ote, super: round2((ote * superRate) / 100), hours };
}

// ---------------------------------------------------------------------------
// Pay periods
// ---------------------------------------------------------------------------

export type PayFrequency = "WEEKLY" | "FORTNIGHTLY";

const DAY = 86_400_000;
const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The pay period containing `date` (yyyy-MM-dd). Periods start on `anchor`
 * (a yyyy-MM-dd that began some period) and repeat every 7 or 14 days.
 */
export function periodFor(date: string, frequency: PayFrequency, anchor: string): { start: string; end: string } {
  const len = frequency === "FORTNIGHTLY" ? 14 : 7;
  const offset = Math.round((toDate(date).getTime() - toDate(anchor).getTime()) / DAY);
  const k = Math.floor(offset / len);
  const start = new Date(toDate(anchor).getTime() + k * len * DAY);
  return { start: ymd(start), end: ymd(new Date(start.getTime() + (len - 1) * DAY)) };
}

export function shiftPeriod(p: { start: string; end: string }, by: number): { start: string; end: string } {
  const len = Math.round((toDate(p.end).getTime() - toDate(p.start).getTime()) / DAY) + 1;
  const s = new Date(toDate(p.start).getTime() + by * len * DAY);
  return { start: ymd(s), end: ymd(new Date(s.getTime() + (len - 1) * DAY)) };
}

// ---------------------------------------------------------------------------
// Timesheet checks
// ---------------------------------------------------------------------------

export interface TimesheetFlag {
  code: "NO_CLOCK_IN" | "NO_CLOCK_OUT" | "LATE" | "EARLY_FINISH" | "OVER_ROSTER" | "LONG_SHIFT";
  label: string;
}

/** Things an approver should look at before approving a timesheet. */
export function timesheetFlags(
  s: { startAt: Date; endAt: Date; clockInAt: Date | null; clockOutAt: Date | null; workedStart: Date | null; workedEnd: Date | null; breakMins: number },
  now: Date = new Date(),
): TimesheetFlag[] {
  const flags: TimesheetFlag[] = [];
  const mins = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / MIN);
  const edited = Boolean(s.workedStart && !s.clockInAt);
  if (!s.clockInAt && !edited && s.startAt < now) flags.push({ code: "NO_CLOCK_IN", label: "No clock-in" });
  if (s.clockInAt && !s.clockOutAt && !s.workedEnd && s.endAt < now) flags.push({ code: "NO_CLOCK_OUT", label: "No clock-out" });
  if (s.clockInAt && mins(s.clockInAt, s.startAt) > 15) flags.push({ code: "LATE", label: `Started ${mins(s.clockInAt, s.startAt)} min late` });
  const end = s.workedEnd ?? s.clockOutAt;
  if (end && mins(s.endAt, end) > 15) flags.push({ code: "EARLY_FINISH", label: `Finished ${mins(s.endAt, end)} min early` });
  if (end && mins(end, s.endAt) > 15) flags.push({ code: "OVER_ROSTER", label: `${mins(end, s.endAt)} min past rostered end` });
  const start = s.workedStart ?? s.startAt;
  const hrs = paidMinutes({ start, end: end ?? s.endAt, breakMins: s.breakMins }) / 60;
  if (hrs > 12) flags.push({ code: "LONG_SHIFT", label: `${Math.round(hrs * 10) / 10} h shift` });
  return flags;
}
