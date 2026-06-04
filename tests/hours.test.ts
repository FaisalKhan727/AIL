import { describe, expect, it } from "vitest";
import { shiftHours, totalHours, totalPay } from "../lib/hours";

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
