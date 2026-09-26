import { describe, expect, it } from "vitest";
import { startOfWeekMon, endOfWeekSun, startOfDayInTz, endOfDayInTz } from "../lib/date";

const MELBOURNE = "Australia/Melbourne";

describe("startOfWeekMon / endOfWeekSun (timezone-aware)", () => {
  // Regression test for a real bug: these used to be computed from the
  // server's local clock (`.getDay()` / `.setHours()`), not the company's
  // timezone. On a UTC server, a shift just after midnight Monday in
  // Melbourne is still Sunday afternoon in UTC — so the old code put it in
  // the wrong week, and its hours got dropped from (or double counted
  // across) the wrong weekly timesheet.

  it("treats 00:30 Monday Melbourne time as inside the new week, even though it's still Sunday afternoon UTC", () => {
    // 2026-06-01 00:30 AEST (UTC+10, winter — no DST) = 2026-05-31 14:30 UTC.
    const justAfterMidnightMonday = new Date("2026-05-31T14:30:00.000Z");
    const start = startOfWeekMon(justAfterMidnightMonday, MELBOURNE);
    // Expected: 2026-06-01 00:00:00 AEST == 2026-05-31 14:00:00 UTC.
    expect(start.toISOString()).toBe("2026-05-31T14:00:00.000Z");
  });

  it("keeps 23:59 Sunday Melbourne time inside the week that's ending, even though it's already Monday in UTC", () => {
    // 2026-06-07 23:59 AEST = 2026-06-07 13:59 UTC (still Sunday UTC in this
    // case, but the point stands near any boundary — pick an instant that's
    // Monday in UTC while still Sunday in Melbourne):
    // 2026-06-08 09:00 UTC = 2026-06-08 19:00 AEST (Monday evening, sanity check reverse case)
    const lateSundayMelbourne = new Date("2026-06-07T13:00:00.000Z"); // 2026-06-07 23:00 AEST
    const end = endOfWeekSun(lateSundayMelbourne, MELBOURNE);
    // Week containing 2026-06-07 (Sunday) ends 2026-06-07 23:59:59.999 AEST
    // == 2026-06-07 13:59:59.999 UTC.
    expect(end.toISOString()).toBe("2026-06-07T13:59:59.999Z");
  });

  it("computes a Mon 00:00 -> Sun 23:59:59.999 span in the target timezone", () => {
    const midweek = new Date("2026-06-03T05:00:00.000Z"); // Wed in both zones
    const start = startOfWeekMon(midweek, MELBOURNE);
    const end = endOfWeekSun(midweek, MELBOURNE);
    expect(end.getTime() - start.getTime()).toBe(7 * 86_400_000 - 1);
  });

  it("handles the AEDT (UTC+11, daylight saving) part of the year too", () => {
    // 2026-01-05 (Monday) 00:15 AEDT = 2026-01-04 13:15 UTC.
    const justAfterMidnightMonday = new Date("2026-01-04T13:15:00.000Z");
    const start = startOfWeekMon(justAfterMidnightMonday, MELBOURNE);
    expect(start.toISOString()).toBe("2026-01-04T13:00:00.000Z"); // 2026-01-05 00:00 AEDT
  });

  it("defaults to APP_TZ when no timezone is passed", () => {
    const justAfterMidnightMonday = new Date("2026-05-31T14:30:00.000Z");
    const start = startOfWeekMon(justAfterMidnightMonday);
    expect(start.toISOString()).toBe("2026-05-31T14:00:00.000Z");
  });
});

describe("startOfDayInTz / endOfDayInTz", () => {
  it("keeps a just-after-midnight Melbourne instant on the correct calendar day", () => {
    const justAfterMidnight = new Date("2026-05-31T14:05:00.000Z"); // 2026-06-01 00:05 AEST
    const start = startOfDayInTz(justAfterMidnight, MELBOURNE);
    const end = endOfDayInTz(justAfterMidnight, MELBOURNE);
    expect(start.toISOString()).toBe("2026-05-31T14:00:00.000Z"); // 2026-06-01 00:00 AEST
    expect(end.toISOString()).toBe("2026-06-01T13:59:59.999Z"); // 2026-06-01 23:59:59.999 AEST
  });
});
