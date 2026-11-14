import { prisma } from "@/lib/prisma";
import { normaliseAccounting, type AccountingSettings, type ExportInvoice } from "@/lib/exports";
import { refLabel } from "@/lib/ops";
import { serialiseInvoice } from "@/lib/server/invoices";

export async function getAccounting(companyId: string): Promise<AccountingSettings> {
  const row = await prisma.setting.findUnique({ where: { companyId_key: { companyId, key: "accounting" } } });
  let raw: unknown = {};
  try { raw = row ? JSON.parse(row.value) : {}; } catch { /* defaults */ }
  return normaliseAccounting(raw);
}

export async function saveAccounting(companyId: string, s: AccountingSettings) {
  const value = JSON.stringify(s);
  await prisma.setting.upsert({ where: { companyId_key: { companyId, key: "accounting" } }, update: { value }, create: { companyId, key: "accounting", value } });
}

export function toExportInvoice(inv: ReturnType<typeof serialiseInvoice>): ExportInvoice {
  const ymd = (d: Date | null) => (d ?? new Date()).toISOString().slice(0, 10);
  const period = `${ymd(inv.periodStart).split("-").reverse().join("/")}–${ymd(inv.periodEnd).split("-").reverse().join("/")}`;
  return {
    number: refLabel("INV", inv.number),
    clientName: inv.client.name,
    clientEmail: inv.client.billingEmail || inv.client.contactEmail,
    issued: ymd(inv.issuedAt),
    due: ymd(inv.dueAt ?? new Date((inv.issuedAt ?? new Date()).getTime() + inv.client.paymentTermsDays * 86_400_000)),
    reference: `Security services ${period}`,
    paymentTermsDays: inv.client.paymentTermsDays,
    gstRate: inv.gstRate,
    lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
  };
}

export async function logSync(companyId: string, provider: string, kind: string, ok: boolean, message: string, ref?: string) {
  await prisma.syncLog.create({ data: { companyId, provider, kind, ok, message: message.slice(0, 500), ref } });
}
