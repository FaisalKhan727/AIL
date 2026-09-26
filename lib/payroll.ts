import { prisma } from "@/lib/prisma";
import { APP_TZ } from "@/lib/date";
import { shiftHours, shiftPayRate, totalHours, totalPay } from "@/lib/hours";

export interface WeeklyGuardShift {
  id: string;
  startAt: Date;
  endAt: Date;
  workedStart: Date | null;
  workedEnd: Date | null;
  status: string;
  siteName: string;
  /** Per-shift hours — see lib/hours.ts. Always sums to totalHours below. */
  hours: number;
  /** Admin-entered hours override, if any (null = using computed hours). */
  hoursOverride: number | null;
  /** Rate actually applied to this shift — its own override, else the
   *  guard's default rate below. */
  payRate: number;
  /** Per-shift rate override, if any (null = using the guard's default). */
  payRateOverride: number | null;
  /** This shift's own contribution to totalPay (hours * payRate). */
  pay: number;
}

export interface WeeklyGuardHours {
  guardId: string;
  guardName: string;
  /** Guard's default hourly rate (Guard.payRate) — shifts without their own
   *  payRateOverride are paid at this rate. */
  payRate: number;
  totalHours: number;
  totalPay: number;
  shifts: WeeklyGuardShift[];
}

/** Company's configured timezone, falling back to APP_TZ. Shared by every
 *  route that needs to compute week/day boundaries for a tenant. */
export async function resolveCompanyTz(companyId: string): Promise<string> {
  const tzRow = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key: "timezone" } },
  });
  return tzRow?.value || APP_TZ;
}

/**
 * Live (not persisted) per-guard hours/pay for one Mon-Sun week — the
 * single source of truth both /api/timesheets and /api/payroll build on,
 * so the two pages can never disagree about what a guard is owed.
 */
export async function computeWeeklyGuardHours(
  companyId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<WeeklyGuardHours[]> {
  const allShifts = await prisma.shift.findMany({
    where: {
      roster: { companyId },
      startAt: { gte: weekStart, lte: weekEnd },
      status: { in: ["CONFIRMED", "WORKED"] },
    },
    include: { guard: true, site: true },
    orderBy: { startAt: "asc" },
  });
  // Unassigned placeholder shifts can't be in CONFIRMED/WORKED status, but
  // narrow the type so the rest of this function can treat guard as non-null.
  const shifts = allShifts.filter(
    (s): s is typeof s & { guardId: string; guard: NonNullable<typeof s.guard> } =>
      s.guardId != null && s.guard != null,
  );

  const byGuard = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const list = byGuard.get(s.guardId) ?? [];
    list.push(s);
    byGuard.set(s.guardId, list);
  }

  return Array.from(byGuard.entries()).map(([guardId, list]) => {
    const guard = list[0].guard;
    const rate = guard.payRate ? Number(guard.payRate.toString()) : 0;

    // Prisma's Decimal isn't a plain number — convert once per shift so
    // lib/hours.ts (and this function's own output) work with plain numbers.
    const forCalc = list.map((s) => ({
      status: s.status,
      startAt: s.startAt,
      endAt: s.endAt,
      workedStart: s.workedStart,
      workedEnd: s.workedEnd,
      hoursOverride: s.hoursOverride != null ? Number(s.hoursOverride.toString()) : null,
      payRateOverride: s.payRateOverride != null ? Number(s.payRateOverride.toString()) : null,
    }));

    return {
      guardId,
      guardName: `${guard.firstName} ${guard.lastName}`,
      payRate: rate,
      totalHours: totalHours(forCalc),
      totalPay: totalPay(forCalc, rate),
      shifts: list.map((s, i) => {
        const c = forCalc[i];
        const hours = shiftHours(c);
        const payRateForShift = shiftPayRate(c, rate);
        return {
          id: s.id,
          startAt: s.startAt,
          endAt: s.endAt,
          workedStart: s.workedStart,
          workedEnd: s.workedEnd,
          status: s.status,
          siteName: s.site.name,
          hours,
          hoursOverride: c.hoursOverride,
          payRate: payRateForShift,
          payRateOverride: c.payRateOverride,
          pay: Math.round(hours * payRateForShift * 100) / 100,
        };
      }),
    };
  });
}
