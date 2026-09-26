import { describe, expect, it } from "vitest";
import { shiftHours, shiftPay, totalHours, totalPay } from "../lib/hours";

const d = (iso: string) => new Date(iso);

describe("shiftHours", () => {
  it("returns 0 for PENDING shift", () => {
    expect(
      shiftHours({
        status: "PENDING",
        startAt: d("2026-05-04T18:00:00Z"),
        endAt: d("2026-05-05T02:00:00Z"),
      }),
    ).toBe(0);
  });

  it("uses scheduled times for CONFIRMED with no worked times", () => {
    expect(
      shiftHours({
        status: "CONFIRMED",
        startAt: d("2026-05-04T18:00:00Z"),
        endAt: d("2026-05-05T02:00:00Z"),
      }),
    ).toBe(8);
  });

  it("uses worked times when set, even on WORKED status", () => {
    expect(
      shiftHours({
        status: "WORKED",
        startAt: d("2026-05-04T18:00:00Z"),
        endAt: d("2026-05-05T02:00:00Z"),
        workedStart: d("2026-05-04T18:15:00Z"),
        workedEnd: d("2026-05-05T02:00:00Z"),
      }),
    ).toBe(7.75);
  });

  it("returns 0 for REJECTED", () => {
    expect(
      shiftHours({
        status: "REJECTED",
        startAt: d("2026-05-04T18:00:00Z"),
        endAt: d("2026-05-05T02:00:00Z"),
      }),
    ).toBe(0);
  });

  it("ignores worked window under 15 min (mis-tap) and falls back to scheduled", () => {
    expect(
      shiftHours({
        status: "WORKED",
        startAt: d("2026-06-01T08:00:00Z"), // Mon 1 Jun 18:00 Melbourne
        endAt: d("2026-06-01T20:00:00Z"),   // Tue 2 Jun 06:00 Melbourne
        // 12 seconds — the actual prod data that triggered the bug
        workedStart: d("2026-06-01T12:13:47Z"),
        workedEnd:   d("2026-06-01T12:13:59Z"),
      }),
    ).toBe(12);
  });

  it("honours worked window when exactly 15 min", () => {
    expect(
      shiftHours({
        status: "WORKED",
        startAt: d("2026-05-04T18:00:00Z"),
        endAt: d("2026-05-05T02:00:00Z"),
        workedStart: d("2026-05-04T19:00:00Z"),
        workedEnd:   d("2026-05-04T19:15:00Z"),
      }),
    ).toBe(0.25);
  });

  it("uses worked start with scheduled end when clocked in but not out", () => {
    expect(
      shiftHours({
        status: "CONFIRMED",
        startAt: d("2026-05-04T18:00:00Z"),
        endAt: d("2026-05-05T02:00:00Z"), // 8h scheduled
        workedStart: d("2026-05-04T18:30:00Z"),
        workedEnd: null,
      }),
    ).toBe(7.5);
  });
});

// Documents the root cause of the "Elsternwick Park VAFA" production
// incident: four CONFIRMED shifts displaying 30h for an 11:00-17:00 slot.
// shiftHours() is correct here — it faithfully reports the scheduled
// duration. The bug was that `endAt` was stored a full calendar day later
// than intended (an admin/data-entry mistake when creating the shift), not
// a computation error. The real fix is catching this at entry time (the
// live "Duration: Xh" warning in ShiftFormDialog) plus
// scripts/check-suspicious-duration-shifts.ts to find existing bad rows —
// this test just pins down that shiftHours() itself isn't what to "fix".
describe("shiftHours reflects bad scheduled data faithfully (not a bug in shiftHours itself)", () => {
  it("reports 30h for an 11:00-17:00 shift whose endAt was mistakenly saved a day later", () => {
    expect(
      shiftHours({
        status: "CONFIRMED",
        startAt: d("2026-09-25T01:00:00Z"), // Fri 25 Sep 11:00 Melbourne (AEST, UTC+10)
        endAt: d("2026-09-26T07:00:00Z"),   // Sat 26 Sep 17:00 Melbourne — should have been Fri
      }),
    ).toBe(30);
  });

  it("reports the intended 6h once endAt is corrected to the same day", () => {
    expect(
      shiftHours({
        status: "CONFIRMED",
        startAt: d("2026-09-25T01:00:00Z"), // Fri 25 Sep 11:00 Melbourne
        endAt: d("2026-09-25T07:00:00Z"),   // Fri 25 Sep 17:00 Melbourne
      }),
    ).toBe(6);
  });
});

describe("totalHours / totalPay", () => {
  const shifts = [
    { status: "CONFIRMED", startAt: d("2026-05-04T18:00:00Z"), endAt: d("2026-05-05T02:00:00Z") }, // 8h
    { status: "WORKED",    startAt: d("2026-05-06T22:00:00Z"), endAt: d("2026-05-07T06:00:00Z") }, // 8h
    { status: "PENDING",   startAt: d("2026-05-09T20:00:00Z"), endAt: d("2026-05-10T04:00:00Z") }, // 0h
  ];

  it("sums payable shifts", () => {
    expect(totalHours(shifts)).toBe(16);
  });

  it("multiplies by pay rate", () => {
    expect(totalPay(shifts, 38.5)).toBe(616);
  });
});

describe("hoursOverride", () => {
  it("wins over scheduled times", () => {
    expect(
      shiftHours({
        status: "CONFIRMED",
        startAt: d("2026-05-04T18:00:00Z"),
        endAt: d("2026-05-05T02:00:00Z"), // 8h scheduled
        hoursOverride: 6.5,
      }),
    ).toBe(6.5);
  });

  it("wins over worked times too", () => {
    expect(
      shiftHours({
        status: "WORKED",
        startAt: d("2026-05-04T18:00:00Z"),
        endAt: d("2026-05-05T02:00:00Z"),
        workedStart: d("2026-05-04T18:00:00Z"),
        workedEnd: d("2026-05-05T02:00:00Z"), // 8h worked
        hoursOverride: 5,
      }),
    ).toBe(5);
  });

  it("is ignored (falls back to 0) for a non-payable status", () => {
    expect(
      shiftHours({
        status: "PENDING",
        startAt: d("2026-05-04T18:00:00Z"),
        endAt: d("2026-05-05T02:00:00Z"),
        hoursOverride: 10,
      }),
    ).toBe(0);
  });
});

describe("payRateOverride / shiftPay / totalPay with mixed rates", () => {
  // The exact scenario a user asked for: a guard works one day at their
  // usual rate and another day at a different (higher) rate — the weekly
  // total must reflect both correctly, not just multiply everything by one
  // flat rate.
  const guardDefaultRate = 35;

  it("shiftPay uses the guard's default rate when no override is set", () => {
    expect(
      shiftPay(
        { status: "CONFIRMED", startAt: d("2026-05-04T18:00:00Z"), endAt: d("2026-05-05T02:00:00Z") }, // 8h
        guardDefaultRate,
      ),
    ).toBe(280); // 8 * 35
  });

  it("shiftPay uses payRateOverride when set, ignoring the guard's default", () => {
    expect(
      shiftPay(
        {
          status: "CONFIRMED",
          startAt: d("2026-05-04T18:00:00Z"),
          endAt: d("2026-05-05T02:00:00Z"), // 8h
          payRateOverride: 50,
        },
        guardDefaultRate,
      ),
    ).toBe(400); // 8 * 50
  });

  it("totalPay sums each shift at its own effective rate", () => {
    const mixedRateWeek = [
      // Mon: normal day at the guard's usual $35/hr -> 8h * 35 = 280
      { status: "CONFIRMED", startAt: d("2026-05-04T18:00:00Z"), endAt: d("2026-05-05T02:00:00Z") },
      // Wed: special event site at a bumped $50/hr -> 6h * 50 = 300
      {
        status: "WORKED",
        startAt: d("2026-05-06T20:00:00Z"),
        endAt: d("2026-05-07T02:00:00Z"),
        payRateOverride: 50,
      },
    ];
    expect(totalHours(mixedRateWeek)).toBe(14);
    expect(totalPay(mixedRateWeek, guardDefaultRate)).toBe(580); // 280 + 300
  });

  it("combines an hours override and a rate override on the same shift", () => {
    expect(
      shiftPay(
        {
          status: "CONFIRMED",
          startAt: d("2026-05-04T18:00:00Z"),
          endAt: d("2026-05-05T02:00:00Z"), // 8h scheduled, but corrected to 6h
          hoursOverride: 6,
          payRateOverride: 45,
        },
        guardDefaultRate,
      ),
    ).toBe(270); // 6 * 45
  });
});
