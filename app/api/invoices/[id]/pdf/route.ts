import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { renderInvoicePdf, type InvoiceLine } from "@/lib/invoices/pdf";

/**
 * GET /api/invoices/[id]/pdf
 * Renders the invoice PDF on-demand from the snapshotted invoice row
 * and the live alarm rows it references. Streams back as
 * application/pdf with a download filename.
 *
 * We don't store generated PDFs — regenerating is fast (sub-second) and
 * lets us avoid R2/S3 infra entirely for this feature.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const invoice = await prisma.alarmInvoice.findFirst({
    where: { id: params.id, companyId: auth.companyId },
  });
  if (!invoice) return jsonError("not found", 404);

  const company = await prisma.company.findUnique({
    where: { id: auth.companyId },
    select: { name: true },
  });

  const alarmIds = JSON.parse(invoice.alarmIds || "[]") as string[];
  const alarms = await prisma.alarmJob.findMany({
    where: { id: { in: alarmIds }, companyId: auth.companyId },
    include: {
      responders: { orderBy: { dispatchedAt: "desc" }, take: 1 },
    },
    orderBy: { receivedAt: "asc" },
  });

  const ratePerAlarm = Number(invoice.ratePerAlarm);
  const lines: InvoiceLine[] = alarms.map((a) => {
    const r = a.responders[0];
    const timeOnSiteMin =
      r?.onsiteAt && r?.offsiteAt
        ? Math.round((r.offsiteAt.getTime() - r.onsiteAt.getTime()) / 60_000)
        : null;
    return {
      docket: a.docket,
      receivedAt: a.receivedAt,
      siteName: a.siteName,
      alarmType: a.alarmType,
      timeOnSiteMin,
      amount: ratePerAlarm,
    };
  });

  const pdf = await renderInvoicePdf({
    companyName: company?.name ?? "Vigilo",
    invoiceId: invoice.id,
    source: invoice.source,
    periodYear: invoice.periodYear,
    periodMonth: invoice.periodMonth,
    generatedAt: invoice.generatedAt,
    ratePerAlarm,
    alarmCount: invoice.alarmCount,
    totalAmount: Number(invoice.totalAmount),
    lines,
  });

  const filename = `invoice-${invoice.source.replace(/[^a-zA-Z0-9]+/g, "-")}-${invoice.periodYear}-${String(invoice.periodMonth).padStart(2, "0")}.pdf`;
  // Node Buffer is Uint8Array-compatible; cast to fit the Response body type
  // surface without copying.
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
