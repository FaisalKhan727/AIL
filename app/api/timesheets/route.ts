import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { periodFor } from "@/lib/payroll";
import { getPaySettings, periodBounds, serialiseTimesheet, timesheetInclude } from "@/lib/server/payroll";

// Timesheets for one pay period: every assigned shift in the period that has
// started, with worked times, flags and approval state.
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const settings = await getPaySettings(auth.companyId);
  const sp = new URL(req.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const def = periodFor(today, settings.frequency, settings.anchor);
  const start = sp.get("start") ?? def.start;
  const end = sp.get("end") ?? def.end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return jsonError("Invalid period", 400);
  const { from, to } = periodBounds(start, end, settings.tz);
  const now = new Date();

  const shifts = await prisma.shift.findMany({
    where: {
      roster: { companyId: auth.companyId },
      guardId: { not: null },
      status: { in: ["CONFIRMED", "WORKED"] },
      startAt: { gte: from, lt: to, lte: now },
    },
    include: timesheetInclude,
    orderBy: [{ startAt: "asc" }],
  });
  return NextResponse.json({
    period: { start, end },
    frequency: settings.frequency,
    timesheets: shifts.map((s) => serialiseTimesheet(s, now)),
  });
}
