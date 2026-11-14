import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  DEFAULT_RULES,
  calculatePay,
  normaliseRules,
  paidMinutes,
  payTotals,
  periodFor,
  shiftPeriod,
  timesheetFlags,
  weekKey,
} from "@/lib/payroll";

const TZ = "Australia/Melbourne";
const at = (local: string) => fromZonedTime(local, TZ);
const shift = (id: string, start: string, end: string, breakMins = 0) => ({ id, start: at(start), end: at(end), breakMins });
const perm = { employmentType: "FULL_TIME", baseRate: 30 };
const casual = { employmentType: "CASUAL", baseRate: 30 };
const none = new Set<string>();
const byCat = (lines: { category: string; minutes: number }[]) =>
  lines.reduce<Record<string, number>>((m, l) => ((m[l.category] = (m[l.category] ?? 0) + l.minutes), m), {});

// 2026-11-11 is a Wednesday, 2026-11-14 a Saturday, 2026-11-15 a Sunday.
describe("calculatePay — classification", () => {
  it("pays a weekday day shift as ordinary hours", () => {
    const l = calculatePay([shift("a", "2026-11-11T09:00", "2026-11-11T17:00")], perm, DEFAULT_RULES, none, TZ);
    expect(byCat(l)).toEqual({ ORDINARY: 480 });
    expect(l[0].amount).toBe(240);
  });

  it("splits a weekday evening shift at the night-band start", () => {
    const l = calculatePay([shift("a", "2026-11-11T14:00", "2026-11-11T22:00")], perm, DEFAULT_RULES, none, TZ);
    expect(byCat(l)).toEqual({ ORDINARY: 240, NIGHT: 240 });
  });

  it("moves to Saturday rates at midnight Friday", () => {
    const l = calculatePay([shift("a", "2026-11-13T22:00", "2026-11-14T06:00")], perm, DEFAULT_RULES, none, TZ);
    expect(byCat(l)).toEqual({ NIGHT: 120, SATURDAY: 360 });
    expect(l.find((x) => x.category === "SATURDAY")?.workDate).toBe("2026-11-14");
  });

  it("pays Sunday at the Sunday rate, all day", () => {
    const l = calculatePay([shift("a", "2026-11-15T06:00", "2026-11-15T14:00")], perm, DEFAULT_RULES, none, TZ);
    expect(byCat(l)).toEqual({ SUNDAY: 480 });
    expect(l[0].amount).toBe(480);
  });

  it("lets a public holiday override the weekday", () => {
    const l = calculatePay([shift("a", "2026-11-03T08:00", "2026-11-03T16:00")], perm, DEFAULT_RULES, new Set(["2026-11-03"]), TZ);
    expect(byCat(l)).toEqual({ PUBLIC_HOLIDAY: 480 });
    expect(l[0].amount).toBe(600);
  });

  it("applies the casual table, which includes the casual loading", () => {
    const l = calculatePay([shift("a", "2026-11-11T09:00", "2026-11-11T17:00")], casual, DEFAULT_RULES, none, TZ);
    expect(l[0].multiplier).toBe(1.25);
    expect(l[0].amount).toBe(300);
  });

  it("handles the daylight-saving change in April without losing an hour of pay", () => {
    // Clocks go back at 03:00 on Sun 5 Apr 2026 in Melbourne: 22:00→06:00 is 9 real hours.
    const l = calculatePay([shift("a", "2026-04-04T22:00", "2026-04-05T06:00")], perm, DEFAULT_RULES, none, TZ);
    expect(l.reduce((n, x) => n + x.minutes, 0)).toBe(540);
  });
});

describe("calculatePay — breaks and overtime", () => {
  it("takes the unpaid break out pro rata", () => {
    const l = calculatePay([shift("a", "2026-11-11T14:00", "2026-11-11T22:00", 30)], perm, DEFAULT_RULES, none, TZ);
    expect(byCat(l)).toEqual({ ORDINARY: 225, NIGHT: 225 });
  });

  it("puts hours past the daily limit into overtime, first two hours at 150%", () => {
    const rules = { ...DEFAULT_RULES, dailyOtHours: 8 };
    const l = calculatePay([shift("a", "2026-11-11T06:00", "2026-11-11T17:00")], perm, rules, none, TZ);
    expect(byCat(l)).toEqual({ ORDINARY: 480, OT_150: 120, OT_200: 60 });
  });

  it("uses the Sunday overtime rate for overtime worked on a Sunday", () => {
    const rules = { ...DEFAULT_RULES, dailyOtHours: 8 };
    const l = calculatePay([shift("a", "2026-11-15T06:00", "2026-11-15T16:00")], perm, rules, none, TZ);
    expect(byCat(l)).toEqual({ SUNDAY: 480, OT_SUNDAY: 120 });
  });

  it("applies the weekly ordinary-hours limit in the order hours were worked", () => {
    const rules = { ...DEFAULT_RULES, weeklyOtHours: 20 };
    const l = calculatePay(
      [shift("c", "2026-11-11T09:00", "2026-11-11T17:00"), shift("a", "2026-11-09T09:00", "2026-11-09T17:00"), shift("b", "2026-11-10T09:00", "2026-11-10T17:00")],
      perm, rules, none, TZ,
    );
    expect(byCat(l.filter((x) => x.shiftId === "a"))).toEqual({ ORDINARY: 480 });
    expect(byCat(l.filter((x) => x.shiftId === "b"))).toEqual({ ORDINARY: 480 });
    expect(byCat(l.filter((x) => x.shiftId === "c"))).toEqual({ ORDINARY: 240, OT_150: 120, OT_200: 120 });
  });

  it("resets the weekly limit each Monday", () => {
    const rules = { ...DEFAULT_RULES, weeklyOtHours: 8 };
    const l = calculatePay([shift("a", "2026-11-13T09:00", "2026-11-13T17:00"), shift("b", "2026-11-16T09:00", "2026-11-16T17:00")], perm, rules, none, TZ);
    expect(byCat(l)).toEqual({ ORDINARY: 960 });
  });

  it("can exempt casuals from the weekly limit", () => {
    const rules = { ...DEFAULT_RULES, weeklyOtHours: 8, weeklyOtCasual: false };
    const l = calculatePay([shift("a", "2026-11-09T09:00", "2026-11-09T17:00"), shift("b", "2026-11-10T09:00", "2026-11-10T17:00")], casual, rules, none, TZ);
    expect(byCat(l)).toEqual({ ORDINARY: 960 });
  });
});

describe("totals", () => {
  it("calculates super on ordinary time earnings only", () => {
    const rules = { ...DEFAULT_RULES, dailyOtHours: 8 };
    const l = calculatePay([shift("a", "2026-11-11T06:00", "2026-11-11T16:00")], perm, rules, none, TZ);
    const t = payTotals(l, 12);
    expect(t.gross).toBe(240 + 90);
    expect(t.ote).toBe(240);
    expect(t.super).toBe(28.8);
    expect(t.hours).toBe(10);
  });
});

describe("normaliseRules", () => {
  it("keeps valid overrides and drops nonsense", () => {
    const r = normaliseRules({ superRate: 11.5, nightStart: "19:00", dailyOtHours: -4, permanent: { SATURDAY: 1.6, SUNDAY: "lots" } });
    expect(r.superRate).toBe(11.5);
    expect(r.nightStart).toBe("19:00");
    expect(r.dailyOtHours).toBe(DEFAULT_RULES.dailyOtHours);
    expect(r.permanent.SATURDAY).toBe(1.6);
    expect(r.permanent.SUNDAY).toBe(DEFAULT_RULES.permanent.SUNDAY);
  });
});

describe("pay periods", () => {
  it("finds the weekly and fortnightly period containing a date", () => {
    expect(periodFor("2026-11-14", "WEEKLY", "2026-01-05")).toEqual({ start: "2026-11-09", end: "2026-11-15" });
    expect(periodFor("2026-11-14", "FORTNIGHTLY", "2026-01-05")).toEqual({ start: "2026-11-09", end: "2026-11-22" });
    expect(periodFor("2026-11-08", "FORTNIGHTLY", "2026-01-05")).toEqual({ start: "2026-10-26", end: "2026-11-08" });
    expect(periodFor("2025-12-30", "WEEKLY", "2026-01-05")).toEqual({ start: "2025-12-29", end: "2026-01-04" });
  });
  it("steps to the previous and next period", () => {
    expect(shiftPeriod({ start: "2026-11-02", end: "2026-11-15" }, -1)).toEqual({ start: "2026-10-19", end: "2026-11-01" });
    expect(shiftPeriod({ start: "2026-11-09", end: "2026-11-15" }, 1)).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });
  it("keys weeks by their Monday", () => {
    expect(weekKey("2026-11-15")).toBe("2026-11-09");
    expect(weekKey("2026-11-09")).toBe("2026-11-09");
  });
});

describe("timesheet checks", () => {
  const base = { startAt: at("2026-11-11T18:00"), endAt: at("2026-11-12T02:00"), clockInAt: null, clockOutAt: null, workedStart: null, workedEnd: null, breakMins: 0 };
  const now = at("2026-11-12T09:00");
  it("flags a past shift with no clock-in", () => {
    expect(timesheetFlags(base, now).map((f) => f.code)).toEqual(["NO_CLOCK_IN"]);
  });
  it("doesn't flag a shift whose times the office entered by hand", () => {
    expect(timesheetFlags({ ...base, workedStart: base.startAt, workedEnd: base.endAt }, now)).toEqual([]);
  });
  it("flags late starts, missing clock-outs and long shifts", () => {
    const f = timesheetFlags({ ...base, clockInAt: at("2026-11-11T18:40"), workedStart: at("2026-11-11T18:40"), endAt: at("2026-11-12T08:00") }, now);
    expect(f.map((x) => x.code)).toEqual(["NO_CLOCK_OUT", "LATE", "LONG_SHIFT"]);
  });
  it("paidMinutes never goes negative", () => {
    expect(paidMinutes({ start: at("2026-11-11T09:00"), end: at("2026-11-11T09:20"), breakMins: 30 })).toBe(0);
  });
});
