import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/guard-auth";
import { startOfWeekMon } from "@/lib/date";
import { shiftHours } from "@/lib/hours";

const WEEKS_BACK = 12; // last ~3 months

/**
 * GET /api/g/timesheets?companyId=X
 *
 * Computed (not persisted) timesheet view for the signed-in guard.
 * Groups CONFIRMED + WORKED shifts into Monday-anchored weeks and returns
 * the last 12 weeks of activity.
 *
 * Pay rate is per-company (Guard.payRate sits on the Guard row, one per
 * company), so each shift's pay uses its own company's rate. The week
 * totals are simple sums across whatever shifts fall in that week.
 *
 * companyId filter is optional; when omitted, returns shifts across every
 * company the signed-in identity is a member of.
 */
export async function GET(req: Request) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const url = new URL(req.url);
  const requestedCompanyId = url.searchParams.get("companyId");

  let guardIds: string[];
  if (requestedCompanyId && requestedCompanyId !== "all") {
    const m = guard.memberships.find((x) => x.companyId === requestedCompanyId);
    if (!m) {
      return NextResponse.json({ error: "Not a member of that company" }, { status: 403 });
    }
    guardIds = [m.guardId];
  } else {
    guardIds = guard.memberships.map((m) => m.guardId);
  }

  if (guardIds.length === 0) {
    return NextResponse.json({ weeks: [] });
  }

  const now = new Date();
  const earliestWeekStart = startOfWeekMon(
    new Date(now.getTime() - WEEKS_BACK * 7 * 24 * 3600_000),
  );

  // Roster-status filter intentionally absent — matches the admin
  // /api/timesheets endpoint, which counts CONFIRMED + WORKED shifts
  // regardless of whether the parent roster is DRAFT, PUBLISHED, or
  // ARCHIVED. Without this match, archived past-month rosters made the
  // guard's PWA total silently lower than the admin number for the same
  // week. Tenant scoping is enforced via guardId membership; admin can
  // still hide a guard from a company by setting Guard.active=false.
  const shifts = await prisma.shift.findMany({
    where: {
      guardId: { in: guardIds },
      status: { in: ["CONFIRMED", "WORKED"] },
      startAt: { gte: earliestWeekStart },
    },
    orderBy: { startAt: "desc" },
    select: {
      id: true,
      guardId: true,
      startAt: true,
      endAt: true,
      workedStart: true,
      workedEnd: true,
      status: true,
      site: { select: { id: true, name: true } },
      guard: { select: { payRate: true } },
      roster: {
        select: {
          id: true,
          name: true,
          companyId: true,
          company: { select: { id: true, name: true, brandColour: true } },
        },
      },
    },
  });

  // Group by ISO Monday-anchored week (using yyyy-mm-dd of Monday as the key).
  const buckets = new Map<
    string,
    {
      weekStart: Date;
      weekEnd: Date;
      shifts: Array<{
        id: string;
        startAt: Date;
        endAt: Date;
        workedStart: Date | null;
        workedEnd: Date | null;
        status: string;
        hours: number;
        pay: number;
        siteName: string;
        company: { id: string; name: string; brandColour: string | null };
      }>;
      totalHours: number;
      totalPay: number;
    }
  >();

  for (const s of shifts) {
    const wkStart = startOfWeekMon(s.startAt);
    const key = wkStart.toISOString().slice(0, 10);
    const rate = s.guard?.payRate ? Number(s.guard.payRate.toString()) : 0;
    const hours = shiftHours({
      status: s.status,
      startAt: s.startAt,
      endAt: s.endAt,
      workedStart: s.workedStart ?? undefined,
      workedEnd: s.workedEnd ?? undefined,
    });
    const pay = Math.round(hours * rate * 100) / 100;

    let bucket = buckets.get(key);
    if (!bucket) {
      const weekEnd = new Date(wkStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      weekEnd.setMilliseconds(weekEnd.getMilliseconds() - 1);
      bucket = { weekStart: wkStart, weekEnd, shifts: [], totalHours: 0, totalPay: 0 };
      buckets.set(key, bucket);
    }
    bucket.shifts.push({
      id: s.id,
      startAt: s.startAt,
      endAt: s.endAt,
      workedStart: s.workedStart,
      workedEnd: s.workedEnd,
      status: s.status,
      hours,
      pay,
      siteName: s.site.name,
      company: {
        id: s.roster.company.id,
        name: s.roster.company.name,
        brandColour: s.roster.company.brandColour,
      },
    });
    bucket.totalHours = Math.round((bucket.totalHours + hours) * 100) / 100;
    bucket.totalPay = Math.round((bucket.totalPay + pay) * 100) / 100;
  }

  // Sort weeks by start date desc (most recent first).
  const weeks = Array.from(buckets.values()).sort(
    (a, b) => b.weekStart.getTime() - a.weekStart.getTime(),
  );

  return NextResponse.json({ weeks });
}
