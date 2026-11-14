import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { nextRef, zDate, zNum, zOptStr, zStr } from "@/lib/server/crud";
import { billableJobs, billableShifts, invoiceInclude, serialiseInvoice, shiftLineDescription } from "@/lib/server/invoices";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const rows = await prisma.invoice.findMany({ where: { companyId: auth.companyId }, include: invoiceInclude, orderBy: { number: "desc" } });
  return NextResponse.json(rows.map(serialiseInvoice));
}

const schema = z.object({
  clientId: z.string().min(1),
  periodStart: zDate,
  periodEnd: zDate,
  jobIds: z.array(z.string()).max(500),
  shiftIds: z.array(z.string()).max(2000).default([]),
  extraLines: z.array(z.object({ description: zStr(200), quantity: zNum.positive(), unitPrice: zNum })).max(50),
  notes: zOptStr(1000),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const d = parsed.data;
  if (d.periodEnd < d.periodStart) return jsonError("The period ends before it starts.", 400);
  const client = await prisma.client.findFirst({ where: { id: d.clientId, companyId: auth.companyId } });
  if (!client) return jsonError("client not found", 404);

  // Re-derive the patrol lines on the server: amounts come from the jobs,
  // never from the browser, and a job can only be billed once.
  const available = await billableJobs(auth.companyId, client.id, d.periodStart, d.periodEnd);
  const chosen = available.filter((j) => d.jobIds.includes(j.id));
  if (chosen.length !== d.jobIds.length) return jsonError("Some of those patrol jobs are no longer billable. Reload and try again.", 409);
  const ymd = (x: Date) => x.toISOString().slice(0, 10);
  const hourly = d.shiftIds.length ? (await billableShifts(auth.companyId, client.id, ymd(d.periodStart), ymd(d.periodEnd))).shifts : [];
  const chosenShifts = hourly.filter((s) => d.shiftIds.includes(s.id));
  if (chosenShifts.length !== d.shiftIds.length) return jsonError("Some of those timesheets are no longer billable. Reload and try again.", 409);
  if (chosen.length === 0 && chosenShifts.length === 0 && d.extraLines.length === 0) return jsonError("An invoice needs at least one line.", 400);

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        companyId: auth.companyId,
        number: await nextRef("invoice", auth.companyId),
        clientId: client.id,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        notes: d.notes ?? null,
        lines: {
          create: [
            ...chosen.map((j) => ({
              description: `${j.date.split("-").reverse().join("/")} — ${j.code} ${j.name}${j.status === "PARTIAL" ? ` (partial: ${j.scanned}/${j.stopCount} stops)` : ""}`,
              quantity: 1,
              unitPrice: j.amount,
              jobId: j.id,
            })),
            ...chosenShifts.map((s) => ({ description: shiftLineDescription(s), quantity: s.hours, unitPrice: s.rate, shiftId: s.id })),
            ...d.extraLines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
          ],
        },
      },
    });
    await tx.patrolJob.updateMany({ where: { id: { in: chosen.map((j) => j.id) }, invoiceId: null }, data: { invoiceId: inv.id } });
    const linked = await tx.shift.updateMany({ where: { id: { in: chosenShifts.map((s) => s.id) }, invoiceId: null }, data: { invoiceId: inv.id } });
    if (linked.count !== chosenShifts.length) throw new Error("Some timesheets were just billed on another invoice. Reload and try again.");
    return inv;
  });
  return NextResponse.json({ id: invoice.id, number: invoice.number }, { status: 201 });
}
