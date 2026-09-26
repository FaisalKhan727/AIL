import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { startOfWeekMon, endOfWeekSun, APP_TZ } from "@/lib/date";
import { shiftHours, totalHours, totalPay } from "@/lib/hours";

// Returns a computed (not persisted) timesheet view for the requested week.
// Each guard with payable shifts in the week appears once.
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get("week"); // yyyy-MM-dd of any day in the week
  const baseDate = weekParam ? new Date(weekParam) : new Date();

  // Week boundaries must use the company's configured timezone, not the
  // server's — otherwise shifts near the edge of the week (e.g. just after
  // midnight Monday, Melbourne time) land in the wrong week's totals when
  // this runs on a UTC server.
  const tzRow = await prisma.setting.findUnique({
    where: { companyId_key: { companyId: auth.companyId, key: "timezone" } },
  });
  const tz = tzRow?.value || APP_TZ;
  const weekStart = startOfWeekMon(baseDate, tz);
  const weekEnd = endOfWeekSun(baseDate, tz);

  const allShifts = await prisma.shift.findMany({
    where: {
      roster: { companyId: auth.companyId },
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

  const rows = Array.from(byGuard.entries()).map(([guardId, list]) => {
    const guard = list[0].guard;
    const rate = guard.payRate ? Number(guard.payRate.toString()) : 0;
    const hrs = totalHours(list);
    const pay = totalPay(list, rate);
    return {
      guardId,
      guardName: `${guard.firstName} ${guard.lastName}`,
      payRate: rate,
      shifts: list.map((s) => ({
        id: s.id,
        startAt: s.startAt,
        endAt: s.endAt,
        workedStart: s.workedStart,
        workedEnd: s.workedEnd,
        status: s.status,
        siteName: s.site.name,
        // Per-shift hours, computed the same way totalHours does, so the UI
        // and Excel export can show a breakdown that always sums to the
        // guard's total — and so an implausible single shift (like the 30h
        // Elsternwick Park incident) is visible per-row, not just buried in
        // an already-wrong total.
        hours: shiftHours(s),
      })),
      totalHours: hrs,
      totalPay: pay,
    };
  });

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    rows,
  });
}
