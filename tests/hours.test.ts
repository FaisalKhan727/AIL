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
