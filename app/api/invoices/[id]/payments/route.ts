import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { invoiceInclude, serialiseInvoice } from "@/lib/server/invoices";

const schema = z.object({
  amount: z.coerce.number().positive().max(10_000_000),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(["BANK_TRANSFER", "CARD", "CHEQUE", "CASH", "OTHER"]).default("BANK_TRANSFER"),
  reference: z.string().trim().max(80).optional(),
});

async function load(id: string, companyId: string) {
  return prisma.invoice.findFirst({ where: { id, companyId }, include: invoiceInclude });
}

/** Record money received. The invoice becomes PAID once nothing is owing. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const inv = await load(params.id, auth.companyId);
  if (!inv) return jsonError("not found", 404);
  if (inv.status !== "SENT") return jsonError("Payments can only be recorded against a sent invoice.", 409);
  if (inv.externalProvider === "XERO") return jsonError("This invoice is in Xero. Record the payment there, then use “Bring payments across”.", 409);
  const s = serialiseInvoice(inv);
  const amount = Math.round(parsed.data.amount * 100) / 100;
  if (amount > s.balance + 0.005) return jsonError(`That's more than the ${s.balance.toFixed(2)} still owing.`, 400);
  const paidOn = new Date(`${parsed.data.paidOn}T00:00:00.000Z`);
  await prisma.payment.create({ data: { invoiceId: inv.id, amount, paidOn, method: parsed.data.method, reference: parsed.data.reference || null } });
  if (amount >= s.balance - 0.005) await prisma.invoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: paidOn } });
  return NextResponse.json(serialiseInvoice((await load(inv.id, auth.companyId))!), { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const paymentId = new URL(req.url).searchParams.get("paymentId");
  const inv = await load(params.id, auth.companyId);
  if (!inv || !paymentId) return jsonError("not found", 404);
  const p = inv.payments.find((x) => x.id === paymentId);
  if (!p) return jsonError("not found", 404);
  if (p.source !== "MANUAL") return jsonError("This payment came from your accounting system. Remove it there.", 409);
  await prisma.$transaction([
    prisma.payment.delete({ where: { id: p.id } }),
    ...(inv.status === "PAID" ? [prisma.invoice.update({ where: { id: inv.id }, data: { status: "SENT", paidAt: null } })] : []),
  ]);
  return NextResponse.json(serialiseInvoice((await load(inv.id, auth.companyId))!));
}
