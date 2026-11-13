import type { Prisma } from "@prisma/client";

export const guardShiftInclude = {
  site: { select: { name: true, address: true, contactName: true, contactPhone: true } },
} satisfies Prisma.ShiftInclude;

type ShiftRow = Prisma.ShiftGetPayload<{ include: typeof guardShiftInclude }>;

/** Guards may clock in from this long before the rostered start. */
export const EARLY_CLOCK_IN_MS = 30 * 60_000;
/** ...and clock out until this long after the rostered end. */
export const LATE_CLOCK_OUT_MS = 6 * 3_600_000;

export function serialiseGuardShift(s: ShiftRow, now: Date = new Date()) {
  const onShift = Boolean(s.clockInAt && !s.clockOutAt);
  return {
    id: s.id,
    startAt: s.startAt,
    endAt: s.endAt,
    status: s.status,
    role: s.role,
    notes: s.notes,
    site: s.site,
    clockInAt: s.clockInAt,
    clockOutAt: s.clockOutAt,
    onShift,
    canRespond: s.status === "PENDING" && s.startAt > now,
    canClockIn:
      s.status === "CONFIRMED" &&
      !s.clockInAt &&
      now.getTime() >= s.startAt.getTime() - EARLY_CLOCK_IN_MS &&
      now < s.endAt,
    canClockOut: onShift && now.getTime() <= s.endAt.getTime() + LATE_CLOCK_OUT_MS,
  };
}
