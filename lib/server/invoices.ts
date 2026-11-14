import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invoiceDisplayStatus, invoiceTotals, jobBillable } from "@/lib/ops";

export const invoiceInclude = { client: true, lines: true } satisfies Prisma.InvoiceInclude;
type Row = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export function serialiseInvoice(inv: Row) {
  const lines = inv.lines.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), amount: Math.round(Number(l.quantity) * Number(l.unitPrice) * 100) / 100 }));
  return { ...inv, gstRate: Number(inv.gstRate), lines, displayStatus: invoiceDisplayStatus(inv), ...invoiceTotals(lines, Number(inv.gstRate)) };
}

/** Finished patrol jobs for a client's runs that haven't been invoiced yet. */
export async function billableJobs(companyId: string, clientId: string, from: Date, to: Date) {
  const jobs = await prisma.patrolJob.findMany({
    where: { companyId, invoiceId: null, status: { in: ["COMPLETED", "PARTIAL"] }, date: { gte: from, lte: to }, run: { clientId } },
    include: { run: { select: { code: true, name: true } }, scans: { select: { status: true } } },
    orderBy: { date: "asc" },
  });
  return jobs.map((j) => {
    const scanned = j.scans.filter((s) => s.status === "SCANNED").length;
    return {
      id: j.id,
      date: j.date.toISOString().slice(0, 10),
      code: j.run.code,
      name: j.run.name,
      status: j.status,
      scanned,
      stopCount: j.stopCount,
      rate: Number(j.rate),
      amount: jobBillable({ status: j.status, rate: Number(j.rate), stopCount: j.stopCount, scanned }),
    };
  });
}
