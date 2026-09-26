import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { startOfWeekMon, endOfWeekSun } from "@/lib/date";
import { resolveCompanyTz, computeWeeklyGuardHours } from "@/lib/payroll";

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
  const tz = await resolveCompanyTz(auth.companyId);
  const weekStart = startOfWeekMon(baseDate, tz);
  const weekEnd = endOfWeekSun(baseDate, tz);

  const rows = await computeWeeklyGuardHours(auth.companyId, weekStart, weekEnd);

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    rows,
  });
}
