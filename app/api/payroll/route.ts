import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { startOfWeekMon, endOfWeekSun } from "@/lib/date";
import { resolveCompanyTz, computeWeeklyGuardHours } from "@/lib/payroll";

export interface PayrollRow {
  guardId: string;
  guardName: string;
  payRate: number;
  totalHours: number;
  totalPay: number;
  shiftCount: number;
  status: "PENDING" | "PAID";
  paidAt: string | null;
  paidByName: string | null;
}

// Returns this week's payroll: live-computed hours/pay per guard (same
// source of truth as /api/timesheets), merged with whatever payment status
// has been persisted in the Timesheet table. A guard with no Timesheet row
// yet for this week is simply PENDING — a row is only created once an
// admin marks it paid (or explicitly reopens it after).
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get("week"); // yyyy-MM-dd of any day in the week
  const baseDate = weekParam ? new Date(weekParam) : new Date();

  const tz = await resolveCompanyTz(auth.companyId);
  const weekStart = startOfWeekMon(baseDate, tz);
  const weekEnd = endOfWeekSun(baseDate, tz);

  const computed = await computeWeeklyGuardHours(auth.companyId, weekStart, weekEnd);

  const paymentRows = computed.length
    ? await prisma.timesheet.findMany({
        where: {
          companyId: auth.companyId,
          weekStart,
          guardId: { in: computed.map((r) => r.guardId) },
        },
      })
    : [];
  const paymentByGuard = new Map(paymentRows.map((p) => [p.guardId, p]));

  const paidByIds = Array.from(
    new Set(paymentRows.map((p) => p.paidBy).filter((x): x is string => Boolean(x))),
  );
  const admins = paidByIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: paidByIds } }, select: { id: true, name: true } })
    : [];
  const adminNameById = new Map(admins.map((a) => [a.id, a.name]));

  const rows: PayrollRow[] = computed.map((r) => {
    const payment = paymentByGuard.get(r.guardId);
    const paid = payment?.status === "PAID";
    return {
      guardId: r.guardId,
      guardName: r.guardName,
      payRate: r.payRate,
      totalHours: r.totalHours,
      totalPay: r.totalPay,
      shiftCount: r.shifts.length,
      status: paid ? "PAID" : "PENDING",
      paidAt: paid && payment?.paidAt ? payment.paidAt.toISOString() : null,
      paidByName: paid && payment?.paidBy ? adminNameById.get(payment.paidBy) ?? null : null,
    };
  });
  rows.sort((a, b) => a.guardName.localeCompare(b.guardName));

  const totalPayroll = Math.round(rows.reduce((sum, r) => sum + r.totalPay, 0) * 100) / 100;
  const totalPaid = Math.round(rows.filter((r) => r.status === "PAID").reduce((sum, r) => sum + r.totalPay, 0) * 100) / 100;
  const totalPending = Math.round((totalPayroll - totalPaid) * 100) / 100;

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    rows,
    summary: {
      totalPayroll,
      totalPaid,
      totalPending,
      paidCount: rows.filter((r) => r.status === "PAID").length,
      pendingCount: rows.filter((r) => r.status === "PENDING").length,
    },
  });
}
