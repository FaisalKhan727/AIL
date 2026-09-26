import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { payrollActionSchema } from "@/lib/validators";
import { startOfWeekMon } from "@/lib/date";
import { resolveCompanyTz } from "@/lib/payroll";

// Reopens a previously-paid week back to PENDING (e.g. an admin marked the
// wrong guard, or a payment needs to be redone). Only touches existing PAID
// rows — a guard who was never marked paid has no row to reopen, which is
// fine since "no row" already reads as PENDING everywhere else.
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

  const result = await prisma.timesheet.updateMany({
    where: {
      companyId: auth.companyId,
      weekStart,
      guardId: { in: guardIds },
      status: "PAID",
    },
    data: { status: "PENDING", paidAt: null, paidBy: null },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
