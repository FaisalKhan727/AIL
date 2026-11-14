// What Vigilo sends to and reads from Xero. Every operation writes a line to
// the sync log so the office can see what happened without opening Xero.
import { prisma } from "@/lib/prisma";
import { refLabel } from "@/lib/ops";
import { CATEGORY_LABEL, type Category } from "@/lib/payroll";
import { getAccounting, logSync, toExportInvoice } from "@/lib/server/accounting";
import { invoiceInclude, serialiseInvoice } from "@/lib/server/invoices";
import { client, xeroDate, XeroError } from "@/lib/integrations/xero";

type Client = Awaited<ReturnType<typeof client>>;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function ensureContact(x: Client, companyId: string, c: { id: string; name: string; billingEmail: string | null; contactEmail: string | null; abn: string | null; externalContactId: string | null }) {
  if (c.externalContactId) return c.externalContactId;
  // Match an existing Xero contact by exact name before creating a duplicate.
  const where = encodeURIComponent(`Name=="${c.name.replace(/"/g, '\\"')}"`);
  const found = (await x.get(`/api.xro/2.0/Contacts?where=${where}`)) as { Contacts?: { ContactID: string }[] };
  let id = found?.Contacts?.[0]?.ContactID;
  if (!id) {
    const created = (await x.post("/api.xro/2.0/Contacts", {
      Contacts: [{ Name: c.name, EmailAddress: c.billingEmail || c.contactEmail || undefined, TaxNumber: c.abn || undefined }],
    })) as { Contacts?: { ContactID: string }[] };
    id = created?.Contacts?.[0]?.ContactID;
    if (!id) throw new XeroError(`Xero didn't return a contact for ${c.name}`);
    await logSync(companyId, "XERO", "CONTACT", true, `Created contact ${c.name}`, c.id);
  }
  await prisma.client.update({ where: { id: c.id }, data: { externalContactId: id } });
  return id;
}

/**
 * Send issued invoices to Xero as sales invoices. Drafts in Vigilo are
 * skipped (they have no issue date yet) and so are invoices already sent.
 */
export async function pushInvoices(companyId: string, ids: string[]) {
  const x = await client(companyId);
  const settings = await getAccounting(companyId);
  const rows = await prisma.invoice.findMany({ where: { companyId, id: { in: ids } }, include: invoiceInclude });
  const results: { number: string; ok: boolean; message: string }[] = [];
  for (const row of rows) {
    const number = refLabel("INV", row.number);
    if (row.externalId) { results.push({ number, ok: true, message: "Already in Xero" }); continue; }
    if (row.status !== "SENT" && row.status !== "PAID") { results.push({ number, ok: false, message: "Mark it as sent first" }); continue; }
    try {
      const inv = serialiseInvoice(row);
      const e = toExportInvoice(inv);
      const contactId = await ensureContact(x, companyId, row.client);
      const res = (await x.post("/api.xro/2.0/Invoices", {
        Invoices: [{
          Type: "ACCREC",
          Contact: { ContactID: contactId },
          InvoiceNumber: e.number,
          Reference: e.reference,
          Date: e.issued,
          DueDate: e.due,
          LineAmountTypes: "Exclusive",
          Status: settings.xeroInvoiceStatus,
          CurrencyCode: "AUD",
          LineItems: e.lines.map((l) => ({
            Description: l.description,
            Quantity: l.quantity,
            UnitAmount: l.unitPrice,
            AccountCode: settings.xeroAccountCode,
            TaxType: inv.gstRate > 0 ? "OUTPUT" : "EXEMPTOUTPUT",
          })),
        }],
      })) as { Invoices?: { InvoiceID: string }[] };
      const externalId = res?.Invoices?.[0]?.InvoiceID;
      if (!externalId) throw new XeroError("Xero didn't return an invoice id");
      await prisma.invoice.update({ where: { id: row.id }, data: { externalId, externalProvider: "XERO", syncedAt: new Date() } });
      await logSync(companyId, "XERO", "INVOICE", true, `Sent ${number} to Xero (${settings.xeroInvoiceStatus.toLowerCase()})`, row.id);
      results.push({ number, ok: true, message: "Sent to Xero" });
    } catch (e) {
      await logSync(companyId, "XERO", "INVOICE", false, `${number}: ${msg(e)}`, row.id);
      results.push({ number, ok: false, message: msg(e) });
    }
  }
  return results;
}

/** Bring payments made in Xero across, and mark invoices paid when Xero says so. */
export async function syncPayments(companyId: string) {
  const x = await client(companyId);
  const rows = await prisma.invoice.findMany({ where: { companyId, externalProvider: "XERO", externalId: { not: null }, status: "SENT" }, include: invoiceInclude });
  let updated = 0;
  for (let i = 0; i < rows.length; i += 40) {
    const batch = rows.slice(i, i + 40);
    const res = (await x.get(`/api.xro/2.0/Invoices?IDs=${batch.map((r) => r.externalId).join(",")}`)) as { Invoices?: { InvoiceID: string; Status: string; AmountPaid: number; FullyPaidOnDate?: string }[] };
    for (const xi of res?.Invoices ?? []) {
      const row = batch.find((r) => r.externalId === xi.InvoiceID);
      if (!row) continue;
      // Xero holds the full payment record once an invoice is there (bank
      // feeds, reconciliations). Bring across only what Xero has beyond what
      // Vigilo already shows, whoever recorded it.
      const recorded = row.payments.reduce((n, p) => n + Number(p.amount), 0);
      const extra = Math.round((Number(xi.AmountPaid || 0) - recorded) * 100) / 100;
      if (extra > 0) {
        await prisma.payment.create({ data: { invoiceId: row.id, amount: extra, paidOn: new Date(), source: "XERO", method: "OTHER", reference: "Recorded in Xero" } });
        updated++;
      }
      if (xi.Status === "PAID") await prisma.invoice.update({ where: { id: row.id }, data: { status: "PAID", paidAt: new Date(), syncedAt: new Date() } });
    }
  }
  await logSync(companyId, "XERO", "PAYMENT", true, `Checked ${rows.length} open invoice${rows.length === 1 ? "" : "s"}; ${updated} payment${updated === 1 ? "" : "s"} brought across`);
  return { checked: rows.length, updated };
}

/** Link guards to Xero Payroll employees by matching name or email. */
export async function matchEmployees(companyId: string) {
  const x = await client(companyId);
  const res = (await x.get("/payroll.xro/1.0/Employees")) as { Employees?: { EmployeeID: string; FirstName: string; LastName: string; Email?: string; Status?: string }[] };
  const emps = (res?.Employees ?? []).filter((e) => e.Status !== "TERMINATED");
  const guards = await prisma.guard.findMany({ where: { companyId, active: true } });
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  let matched = 0;
  const unmatched: string[] = [];
  for (const g of guards) {
    const e = emps.find((e) => (g.email && norm(e.Email) === norm(g.email)) || (norm(e.FirstName) === norm(g.firstName) && norm(e.LastName) === norm(g.lastName)));
    if (e) {
      if (g.externalEmployeeId !== e.EmployeeID) await prisma.guard.update({ where: { id: g.id }, data: { externalEmployeeId: e.EmployeeID } });
      matched++;
    } else unmatched.push(`${g.firstName} ${g.lastName}`);
  }
  await logSync(companyId, "XERO", "EMPLOYEE", true, `Matched ${matched} of ${guards.length} guards to Xero employees`);
  return { matched, total: guards.length, unmatched };
}

export async function earningsRates(companyId: string) {
  const x = await client(companyId);
  const res = (await x.get("/payroll.xro/1.0/PayItems")) as { PayItems?: { EarningsRates?: { EarningsRateID: string; Name: string; RateType?: string }[] } };
  return (res?.PayItems?.EarningsRates ?? []).map((r) => ({ id: r.EarningsRateID, name: r.Name, type: r.RateType ?? "" }));
}

/**
 * Send a finalised pay run to Xero Payroll as draft timesheets: one per
 * guard, one line per pay category mapped to a Xero earnings rate, hours per
 * day. Xero applies tax and super when the pay run is processed there.
 * Adjustments have no hours, so they're listed for manual entry.
 */
export async function pushPayRun(companyId: string, payRunId: string) {
  const run = await prisma.payRun.findFirst({ where: { id: payRunId, companyId }, include: { lines: true } });
  if (!run) throw new XeroError("Pay run not found");
  if (run.status !== "FINALISED") throw new XeroError("Finalise the pay run before sending it to Xero.");
  const settings = await getAccounting(companyId);
  const used = Array.from(new Set(run.lines.filter((l) => l.category !== "ADJUSTMENT").map((l) => l.category))) as Category[];
  const unmapped = used.filter((c) => !settings.earningsRates[c]);
  if (unmapped.length) throw new XeroError(`Map these pay categories to Xero earnings rates first: ${unmapped.map((c) => CATEGORY_LABEL[c]).join(", ")}.`);
  const guards = await prisma.guard.findMany({ where: { id: { in: Array.from(new Set(run.lines.map((l) => l.guardId))) } } });
  const noId = guards.filter((g) => !g.externalEmployeeId);
  if (noId.length) throw new XeroError(`Link these guards to Xero employees first: ${noId.map((g) => `${g.firstName} ${g.lastName}`).join(", ")}.`);

  const days = Math.round((run.periodEnd.getTime() - run.periodStart.getTime()) / 86_400_000) + 1;
  const dayIndex = (d: Date) => Math.round((d.getTime() - run.periodStart.getTime()) / 86_400_000);
  const timesheets = guards.map((g) => {
    const ls = run.lines.filter((l) => l.guardId === g.id && l.category !== "ADJUSTMENT");
    const byCat = new Map<string, number[]>();
    for (const l of ls) {
      const arr = byCat.get(l.category) ?? Array(days).fill(0);
      const i = dayIndex(l.workDate);
      if (i >= 0 && i < days) arr[i] = Math.round((arr[i] + Number(l.hours)) * 100) / 100;
      byCat.set(l.category, arr);
    }
    return {
      EmployeeID: g.externalEmployeeId,
      StartDate: xeroDate(run.periodStart),
      EndDate: xeroDate(run.periodEnd),
      Status: "DRAFT",
      TimesheetLines: Array.from(byCat, ([cat, units]) => ({ EarningsRateID: settings.earningsRates[cat as Category], NumberOfUnits: units })),
    };
  });
  const x = await client(companyId);
  try {
    await x.post("/payroll.xro/1.0/Timesheets", timesheets);
  } catch (e) {
    await logSync(companyId, "XERO", "PAYRUN", false, `Pay run ${run.number}: ${msg(e)}`, run.id);
    throw e;
  }
  await prisma.payRun.update({ where: { id: run.id }, data: { exportedAt: new Date(), exportedTo: "Xero Payroll" } });
  const adjustments = run.lines.filter((l) => l.category === "ADJUSTMENT").length;
  await logSync(companyId, "XERO", "PAYRUN", true, `Pay run ${run.number}: ${timesheets.length} draft timesheets sent${adjustments ? `; ${adjustments} adjustment(s) to add in Xero by hand` : ""}`, run.id);
  return { timesheets: timesheets.length, adjustments };
}
