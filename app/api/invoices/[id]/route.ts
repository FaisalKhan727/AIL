import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { money, refLabel } from "@/lib/ops";
import { invoiceInclude, serialiseInvoice } from "@/lib/server/invoices";
import { trySms } from "@/lib/server/ops";
import { getSettingValue } from "@/lib/server/licences";

async function load(id: string, companyId: string) {
  return prisma.invoice.findFirst({ where: { id, companyId }, include: invoiceInclude });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const inv = await load(params.id, auth.companyId);
  if (!inv) return jsonError("not found", 404);
  const company = (await getSettingValue(auth.companyId, "company_name")) || "";
  return NextResponse.json({ ...serialiseInvoice(inv), companyName: company });
}

const schema = z.object({ action: z.enum(["send", "paid", "void", "remind"]), sms: z.boolean().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation", 400);
  const inv = await load(params.id, auth.companyId);
  if (!inv) return jsonError("not found", 404);
  const s = serialiseInvoice(inv);
  const label = refLabel("INV", inv.number);
  const now = new Date();
  let smsSent: boolean | undefined;
  const phone = inv.client.contactPhone;
  const due = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

  switch (parsed.data.action) {
    case "send": {
      if (inv.status !== "DRAFT") return jsonError("Only a draft can be sent.", 409);
      const dueAt = new Date(now.getTime() + inv.client.paymentTermsDays * 86_400_000);
      await prisma.invoice.update({ where: { id: inv.id }, data: { status: "SENT", issuedAt: now, dueAt } });
      if (parsed.data.sms && phone) smsSent = await trySms(phone, `Invoice ${label} for ${money(s.total)} has been issued. Due ${due(dueAt)}.`);
      break;
    }
    case "remind":
      if (inv.status !== "SENT" || !inv.dueAt) return jsonError("Only sent invoices can be chased.", 409);
      if (!phone) return jsonError("This client has no contact phone to text.", 400);
      smsSent = await trySms(phone, `Reminder: invoice ${label} for ${money(s.total)} was due ${due(inv.dueAt)}. Please arrange payment.`);
      if (!smsSent) return jsonError("The SMS could not be sent.", 502);
      break;
    case "paid":
      // Records a payment for whatever is still owing.
      if (inv.status !== "SENT") return jsonError("Only a sent invoice can be marked paid.", 409);
      await prisma.$transaction([
        ...(s.balance > 0 ? [prisma.payment.create({ data: { invoiceId: inv.id, amount: s.balance, paidOn: now } })] : []),
        prisma.invoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: now } }),
      ]);
      break;
    case "void":
      if (inv.status === "PAID") return jsonError("A paid invoice can't be voided.", 409);
      if (s.amountPaid > 0) return jsonError("This invoice has payments recorded. Remove them before voiding it.", 409);
      // Voiding releases its patrol jobs and timesheets so they can be billed again.
      await prisma.$transaction([
        prisma.invoice.update({ where: { id: inv.id }, data: { status: "VOID" } }),
        prisma.patrolJob.updateMany({ where: { invoiceId: inv.id }, data: { invoiceId: null } }),
        prisma.shift.updateMany({ where: { invoiceId: inv.id }, data: { invoiceId: null } }),
      ]);
      break;
  }
  return NextResponse.json({ ok: true, smsSent });
}
