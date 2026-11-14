// File formats for accounting and payroll systems. Pure: callers pass plain
// data in and get file text out.
//
// Header names follow each product's import template as far as we could
// confirm them. MYOB, QuickBooks and Employment Hero all let you map columns
// on import, so the files use those products' own field names to make that
// mapping one click per column.

import Papa from "papaparse";
import { CATEGORY_LABEL, type Category } from "@/lib/payroll";

export interface AccountingSettings {
  xeroAccountCode: string;
  xeroInvoiceStatus: "DRAFT" | "AUTHORISED";
  myobIncomeAccount: string;
  qboItem: string;
  /** Xero Payroll EarningsRateID per Vigilo pay category. */
  earningsRates: Partial<Record<Category, string>>;
}

export const DEFAULT_ACCOUNTING: AccountingSettings = {
  xeroAccountCode: "200",
  xeroInvoiceStatus: "DRAFT",
  myobIncomeAccount: "4-1000",
  qboItem: "Security services",
  earningsRates: {},
};

export function normaliseAccounting(raw: unknown): AccountingSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AccountingSettings>;
  const str = (v: unknown, d: string, max = 60) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : d);
  const rates: Partial<Record<Category, string>> = {};
  if (r.earningsRates && typeof r.earningsRates === "object") {
    for (const [k, v] of Object.entries(r.earningsRates)) if (k in CATEGORY_LABEL && typeof v === "string" && v) rates[k as Category] = v;
  }
  return {
    xeroAccountCode: str(r.xeroAccountCode, DEFAULT_ACCOUNTING.xeroAccountCode, 10),
    xeroInvoiceStatus: r.xeroInvoiceStatus === "AUTHORISED" ? "AUTHORISED" : "DRAFT",
    myobIncomeAccount: str(r.myobIncomeAccount, DEFAULT_ACCOUNTING.myobIncomeAccount, 10),
    qboItem: str(r.qboItem, DEFAULT_ACCOUNTING.qboItem, 100),
    earningsRates: rates,
  };
}

const au = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/"); // dd/MM/yyyy
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export interface ExportInvoice {
  number: string; // INV-1001
  clientName: string;
  clientEmail: string | null;
  issued: string; // yyyy-MM-dd
  due: string;
  reference: string;
  paymentTermsDays: number;
  gstRate: number;
  lines: { description: string; quantity: number; unitPrice: number }[];
}

/** Xero "Import sales invoices" CSV. Rows sharing an InvoiceNumber become one invoice. */
export function xeroInvoicesCsv(invoices: ExportInvoice[], s: AccountingSettings): string {
  const rows = invoices.flatMap((inv) =>
    inv.lines.map((l) => ({
      "*ContactName": inv.clientName,
      EmailAddress: inv.clientEmail ?? "",
      "*InvoiceNumber": inv.number,
      Reference: inv.reference,
      "*InvoiceDate": au(inv.issued),
      "*DueDate": au(inv.due),
      "*Description": l.description,
      "*Quantity": l.quantity,
      "*UnitAmount": money(l.unitPrice),
      "*AccountCode": s.xeroAccountCode,
      "*TaxType": inv.gstRate > 0 ? "GST on Income" : "GST Free Income",
      Currency: "AUD",
    })),
  );
  return Papa.unparse(rows);
}

/** MYOB service sale import (tab-separated). Amounts are tax-exclusive and inclusive. */
export function myobInvoicesTsv(invoices: ExportInvoice[], s: AccountingSettings): string {
  const rows = invoices.flatMap((inv) =>
    inv.lines.map((l) => {
      const ex = l.quantity * l.unitPrice;
      return {
        "Co./Last Name": inv.clientName,
        "Invoice No.": inv.number.replace(/^INV-/, "").slice(0, 8),
        Date: au(inv.issued),
        "Customer PO": inv.reference,
        Description: `${l.description}${l.quantity !== 1 ? ` (${l.quantity} × ${money(l.unitPrice)})` : ""}`,
        "Account No.": s.myobIncomeAccount,
        Amount: money(ex),
        "Inc-Tax Amount": money(ex * (1 + inv.gstRate / 100)),
        "Tax Code": inv.gstRate > 0 ? "GST" : "FRE",
        "Journal Memo": `Sale; ${inv.clientName}`,
        "Payment is Due": "2",
        "Balance Due Days": String(inv.paymentTermsDays),
      };
    }),
  );
  return Papa.unparse(rows, { delimiter: "\t" });
}

/**
 * QuickBooks Online invoice import CSV. QuickBooks rejects negative amounts,
 * so invoices with a credit line are returned in `skipped` for manual entry.
 */
export function quickbooksInvoicesCsv(invoices: ExportInvoice[], s: AccountingSettings): { csv: string; skipped: string[] } {
  const skipped: string[] = [];
  const rows = invoices.flatMap((inv) => {
    if (inv.lines.some((l) => l.unitPrice < 0 || l.quantity < 0)) { skipped.push(inv.number); return []; }
    return inv.lines.map((l) => ({
      InvoiceNo: inv.number,
      Customer: inv.clientName,
      InvoiceDate: au(inv.issued),
      DueDate: au(inv.due),
      Terms: `Net ${inv.paymentTermsDays}`,
      Memo: inv.reference,
      "Item(Product/Service)": s.qboItem,
      ItemDescription: l.description,
      ItemQuantity: l.quantity,
      ItemRate: money(l.unitPrice),
      ItemAmount: money(l.quantity * l.unitPrice),
      ItemTaxCode: inv.gstRate > 0 ? "GST" : "GST free",
    }));
  });
  return { csv: Papa.unparse(rows), skipped };
}

// ---------------------------------------------------------------------------
// Pay runs
// ---------------------------------------------------------------------------

export interface ExportPayLine {
  guardName: string;
  firstName: string;
  lastName: string;
  payrollRef: string | null;
  employmentType: string;
  workDate: string; // yyyy-MM-dd
  category: string;
  hours: number;
  baseRate: number;
  multiplier: number;
  amount: number;
  superable: boolean;
  note: string | null;
}

/** One row per guard per pay category per day, with rates spelled out. */
export function payRunSummaryCsv(lines: ExportPayLine[], meta: { number: number; periodStart: string; periodEnd: string; payDate: string }): string {
  return Papa.unparse(
    lines.map((l) => ({
      "Pay run": meta.number,
      "Period start": au(meta.periodStart),
      "Period end": au(meta.periodEnd),
      "Pay date": au(meta.payDate),
      Employee: l.guardName,
      "Payroll ID": l.payrollRef ?? "",
      Employment: l.employmentType,
      Date: au(l.workDate),
      "Pay category": l.category === "ADJUSTMENT" ? l.note ?? "Adjustment" : CATEGORY_LABEL[l.category as Category] ?? l.category,
      Hours: l.hours ? (Math.round(l.hours * 100) / 100).toFixed(2) : "",
      "Base rate": l.baseRate ? money(l.baseRate) : "",
      Multiplier: l.category === "ADJUSTMENT" ? "" : l.multiplier,
      "Hourly rate": l.baseRate ? money(l.baseRate * l.multiplier) : "",
      Amount: money(l.amount),
      "Counts for super": l.superable ? "Yes" : "No",
    })),
  );
}

/** MYOB AccountRight timesheet import (tab-separated), one row per employee, pay category and day. */
export function myobTimesheetTsv(lines: ExportPayLine[]): string {
  return Papa.unparse(
    lines
      .filter((l) => l.category !== "ADJUSTMENT")
      .map((l) => ({
        "Emp. Co./Last Name": l.lastName,
        "Emp. First Name": l.firstName,
        "Payroll Category": CATEGORY_LABEL[l.category as Category] ?? l.category,
        Date: au(l.workDate),
        Units: (Math.round(l.hours * 100) / 100).toFixed(2),
        Notes: "Vigilo",
      })),
    { delimiter: "\t" },
  );
}

export interface ExportTimesheet {
  payrollRef: string | null;
  guardName: string;
  date: string; // local yyyy-MM-dd of the start
  startTime: string; // local HH:mm
  endDate: string;
  endTime: string;
  breakMins: number;
  location: string;
  workType: string;
  comments: string;
}

/**
 * Employment Hero Payroll custom timesheet file: raw start/finish times, so
 * Employment Hero's own award rules work out the penalties.
 */
export function employmentHeroCsv(rows: ExportTimesheet[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      "Employee External ID": r.payrollRef ?? "",
      "Employee Name": r.guardName,
      "Start Date": au(r.date),
      "Start Time": r.startTime,
      "End Date": au(r.endDate),
      "End Time": r.endTime,
      "Break (minutes)": r.breakMins,
      Location: r.location,
      "Work Type": r.workType,
      Comments: r.comments,
    })),
  );
}
