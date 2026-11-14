import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { myobInvoicesTsv, quickbooksInvoicesCsv, xeroInvoicesCsv } from "@/lib/exports";
import { getAccounting, logSync, toExportInvoice } from "@/lib/server/accounting";
import { invoiceInclude, serialiseInvoice } from "@/lib/server/invoices";

// Download issued invoices in an accounting system's import format.
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format");
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean);
  if (!["xero", "myob", "quickbooks"].includes(format ?? "")) return jsonError("format must be xero, myob or quickbooks", 400);
  if (!ids.length) return jsonError("Choose at least one invoice", 400);
  const rows = await prisma.invoice.findMany({ where: { companyId: auth.companyId, id: { in: ids }, status: { in: ["SENT", "PAID"] } }, include: invoiceInclude, orderBy: { number: "asc" } });
  if (!rows.length) return jsonError("Only sent or paid invoices can be exported. Mark drafts as sent first.", 400);
  const settings = await getAccounting(auth.companyId);
  const inv = rows.map((r) => toExportInvoice(serialiseInvoice(r)));
  const stamp = new Date().toISOString().slice(0, 10);
  let body: string, name: string, type = "text/csv; charset=utf-8", note = "";
  if (format === "xero") { body = xeroInvoicesCsv(inv, settings); name = `xero-invoices-${stamp}.csv`; }
  else if (format === "myob") { body = myobInvoicesTsv(inv, settings); name = `myob-service-sales-${stamp}.txt`; type = "text/tab-separated-values; charset=utf-8"; }
  else {
    const r = quickbooksInvoicesCsv(inv, settings);
    body = r.csv; name = `quickbooks-invoices-${stamp}.csv`;
    if (r.skipped.length) note = `; skipped ${r.skipped.join(", ")} (credit lines aren't accepted by QuickBooks import)`;
  }
  await logSync(auth.companyId, (format as string).toUpperCase(), "INVOICE", true, `Exported ${rows.length} invoice${rows.length === 1 ? "" : "s"} as a file${note}`);
  return new Response(body, { headers: { "content-type": type, "content-disposition": `attachment; filename="${name}"`, ...(note ? { "x-vigilo-note": note.slice(2) } : {}) } });
}
