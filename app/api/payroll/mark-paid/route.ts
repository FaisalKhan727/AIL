import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { payrollActionSchema } from "@/lib/validators";
import { startOfWeekMon, endOfWeekSun } from "@/lib/date";
import { resolveCompanyTz, computeWeeklyGuardHours } from "@/lib/payroll";

// Marks one or more guards' week as PAID. Hours/pay are recomputed
// server-side from live Shift data at the moment of marking (never trusted
// from the client) and snapshotted onto the Timesheet row, so the paid
// amount is exactly what was on screen when the admin clicked the button —
// even if a shift is edited later, the historical payment record doesn't
// silently change underneath it.
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = payrollActionSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const { weekStart: weekStartParam, guardIds } = parsed.data;

  const tz = await resolveCompanyTz(auth.companyId);
  const [y, m, d] = weekStartParam.split("-").map(Number);
  const weekStart = startOfWeekMon(new Date(y, m - 1, d), tz);
  const weekEnd = endOfWeekSun(weekStart, tz);

  const computed = await computeWeeklyGuardHours(auth.companyId, weekStart, weekEnd);
  const computedByGuard = new Map(computed.map((r) => [r.guardId, r]));

  const now = new Date();
  const requested = new Set(guardIds);
  const eligible = computed.filter((r) => requested.has(r.guardId));
  const skipped = guardIds.filter((id) => !computedByGuard.has(id));

  if (eligible.length === 0) {
    return jsonError("none of the requested guards have payable hours this week", 400, { skipped });
  }

  await prisma.$transaction(
    eligible.map((r) =>
      prisma.timesheet.upsert({
        where: { guardId_weekStart: { guardId: r.guardId, weekStart } },
        update: {
          status: "PAID",
          paidAt: now,
          paidBy: auth.userId,
          totalHours: r.totalHours,
          totalPay: r.totalPay,
          weekEnd,
        },
        create: {
          companyId: auth.companyId,
          guardId: r.guardId,
          weekStart,
          weekEnd,
          totalHours: r.totalHours,
          totalPay: r.totalPay,
          status: "PAID",
          paidAt: now,
          paidBy: auth.userId,
        },
      }),
    ),
  );

  return NextResponse.json({ ok: true, paidCount: eligible.length, skipped });
}
