import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

/**
 * GET /api/invoices/[id]
 * Returns one invoice plus the list of alarm rows it covers (for the
 * detail / preview UI). Alarm IDs are snapshotted on the invoice row;
 * the line-item alarms are looked up live, scoped to the same company.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const invoice = await prisma.alarmInvoice.findFirst({
    where: { id: params.id, companyId: auth.companyId },
  });
  if (!invoice) return jsonError("not found", 404);

  const alarmIds = JSON.parse(invoice.alarmIds || "[]") as string[];
  const alarms = await prisma.alarmJob.findMany({
    where: { id: { in: alarmIds }, companyId: auth.companyId },
    include: {
      responders: {
        orderBy: { dispatchedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { receivedAt: "asc" },
  });

  const lines = alarms.map((a) => {
    const r = a.responders[0];
    const timeOnSiteMin =
      r?.onsiteAt && r?.offsiteAt
        ? Math.round((r.offsiteAt.getTime() - r.onsiteAt.getTime()) / 60_000)
        : null;
    return {
      id: a.id,
      docket: a.docket,
      receivedAt: a.receivedAt,
      siteName: a.siteName,
      alarmType: a.alarmType,
      timeOnSiteMin,
    };
  });

  return NextResponse.json({
    id: invoice.id,
    source: invoice.source,
    periodYear: invoice.periodYear,
    periodMonth: invoice.periodMonth,
    alarmCount: invoice.alarmCount,
    ratePerAlarm: Number(invoice.ratePerAlarm),
    totalAmount: Number(invoice.totalAmount),
    generatedAt: invoice.generatedAt,
    lines,
  });
}

/**
 * DELETE /api/invoices/[id] — admin can drop a generated invoice (e.g.,
 * pricing was wrong and they want to regenerate cleanly).
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const existing = await prisma.alarmInvoice.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    select: { id: true },
  });
  if (!existing) return jsonError("not found", 404);
  await prisma.alarmInvoice.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
