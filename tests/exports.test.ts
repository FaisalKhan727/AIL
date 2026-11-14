import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import {
  DEFAULT_ACCOUNTING,
  employmentHeroCsv,
  myobInvoicesTsv,
  myobTimesheetTsv,
  normaliseAccounting,
  payRunSummaryCsv,
  quickbooksInvoicesCsv,
  xeroInvoicesCsv,
  type ExportInvoice,
  type ExportPayLine,
} from "@/lib/exports";

const inv: ExportInvoice = {
  number: "INV-1001", clientName: "Southbank Entertainment, Holdings", clientEmail: "ap@example.com", issued: "2026-11-09", due: "2026-11-23",
  reference: "Security services 02/11/2026–08/11/2026", paymentTermsDays: 14, gstRate: 10,
  lines: [{ description: "Static guarding", quantity: 7.5, unitPrice: 58 }, { description: "Alarm call-out", quantity: 1, unitPrice: 95 }],
};
const credit: ExportInvoice = { ...inv, number: "INV-1002", lines: [{ description: "SLA credit", quantity: 1, unitPrice: -50 }] };
const parse = (csv: string, delimiter = ",") => Papa.parse<Record<string, string>>(csv, { header: true, delimiter }).data;

describe("invoice exports", () => {
  it("writes Xero's import columns, one row per line, AU dates and tax names", () => {
    const rows = parse(xeroInvoicesCsv([inv], DEFAULT_ACCOUNTING));
    expect(rows).toHaveLength(2);
    expect(rows[0]["*ContactName"]).toBe("Southbank Entertainment, Holdings");
    expect(rows[0]["*InvoiceNumber"]).toBe("INV-1001");
    expect(rows[0]["*InvoiceDate"]).toBe("09/11/2026");
    expect(rows[0]["*UnitAmount"]).toBe("58.00");
    expect(rows[0]["*AccountCode"]).toBe("200");
    expect(rows[0]["*TaxType"]).toBe("GST on Income");
  });
  it("writes a tab-separated MYOB file with tax-inclusive amounts and an 8-character invoice number", () => {
    const rows = parse(myobInvoicesTsv([inv], DEFAULT_ACCOUNTING), "\t");
    expect(rows[0]["Invoice No."]).toBe("1001");
    expect(rows[0].Amount).toBe("435.00");
    expect(rows[0]["Inc-Tax Amount"]).toBe("478.50");
    expect(rows[0]["Tax Code"]).toBe("GST");
    expect(rows[0]["Account No."]).toBe("4-1000");
  });
  it("leaves invoices with credit lines out of the QuickBooks file and says so", () => {
    const r = quickbooksInvoicesCsv([inv, credit], DEFAULT_ACCOUNTING);
    expect(r.skipped).toEqual(["INV-1002"]);
    const rows = parse(r.csv);
    expect(rows).toHaveLength(2);
    expect(rows[1].ItemAmount).toBe("95.00");
    expect(rows[0].Terms).toBe("Net 14");
  });
});

describe("pay run exports", () => {
  const line = (over: Partial<ExportPayLine>): ExportPayLine => ({
    guardName: "Liam Nguyen", firstName: "Liam", lastName: "Nguyen", payrollRef: "E0042", employmentType: "CASUAL", workDate: "2026-11-07",
    category: "SATURDAY", hours: 8, baseRate: 28.42, multiplier: 1.75, amount: 397.88, superable: true, note: null, ...over,
  });
  it("spells out hours, rates and super eligibility in the summary", () => {
    const rows = parse(payRunSummaryCsv([line({}), line({ category: "ADJUSTMENT", hours: 0, baseRate: 0, amount: 25, superable: false, note: "Uniform allowance" })], { number: 3, periodStart: "2026-11-02", periodEnd: "2026-11-08", payDate: "2026-11-11" }));
    expect(rows[0]["Pay category"]).toBe("Saturday");
    expect(rows[0]["Hourly rate"]).toBe("49.74");
    expect(rows[0]["Counts for super"]).toBe("Yes");
    expect(rows[1]["Pay category"]).toBe("Uniform allowance");
    expect(rows[1].Hours).toBe("");
  });
  it("leaves adjustments out of the MYOB timesheet file", () => {
    const rows = parse(myobTimesheetTsv([line({}), line({ category: "ADJUSTMENT" })]), "\t");
    expect(rows).toHaveLength(1);
    expect(rows[0]["Emp. Co./Last Name"]).toBe("Nguyen");
    expect(rows[0].Units).toBe("8.00");
  });
  it("writes raw start and finish times for Employment Hero", () => {
    const rows = parse(employmentHeroCsv([{ payrollRef: "E0042", guardName: "Liam Nguyen", date: "2026-11-07", startTime: "22:00", endDate: "2026-11-08", endTime: "06:00", breakMins: 30, location: "Crown Casino", workType: "Static", comments: "" }]));
    expect(rows[0]).toMatchObject({ "Employee External ID": "E0042", "Start Date": "07/11/2026", "End Date": "08/11/2026", "End Time": "06:00", "Break (minutes)": "30" });
  });
});

describe("accounting settings", () => {
  it("falls back to defaults and drops unknown pay categories", () => {
    const s = normaliseAccounting({ xeroAccountCode: "", xeroInvoiceStatus: "AUTHORISED", earningsRates: { SUNDAY: "abc", BOGUS: "x" } });
    expect(s.xeroAccountCode).toBe("200");
    expect(s.xeroInvoiceStatus).toBe("AUTHORISED");
    expect(s.earningsRates).toEqual({ SUNDAY: "abc" });
  });
});
