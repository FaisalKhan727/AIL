import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invoiceTotals, jobBillable } from "@/lib/ops";
import { paidMinutes } from "@/lib/payroll";
import { actualTimes, getPaySettings, periodBounds } from "@/lib/server/payroll";
import { formatInTimeZone } from "date-fns-tz";

export const invoiceInclude = { client: true, lines: true, payments: { orderBy: { paidOn: "asc" } } } satisfies Prisma.InvoiceInclude;
type Row = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export function serialiseInvoice(inv: Row) {
  const lines = inv.lines.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), amount: Math.round(Number(l.quantity) * Number(l.unitPrice) * 100) / 100 }));
  const totals = invoiceTotals(lines, Number(inv.gstRate));
  const payments = inv.payments.map((p) => ({ ...p, amount: Number(p.amount) }));
  const amountPaid = Math.round(payments.reduce((n, p) => n + p.amount, 0) * 100) / 100;
  const balance = Math.round((totals.total - amountPaid) * 100) / 100;
  const overdue = inv.status === "SENT" && inv.dueAt && inv.dueAt.getTime() < Date.now() && balance > 0;
  const displayStatus = overdue ? "OVERDUE" : inv.status === "SENT" && amountPaid > 0 ? "PART_PAID" : inv.status;
  return { ...inv, gstRate: Number(inv.gstRate), lines, payments, amountPaid, balance, displayStatus, ...totals };
}

/**
 * Approved guard hours at this client's sites that haven't been billed, priced
 * at each site's hourly bill rate. Sites with hours but no rate are reported
 * so the office can set one.
 */
export async function billableShifts(companyId: string, clientId: string, start: string, end: string) {
  const { tz } = await getPaySettings(companyId);
  const { from, to } = periodBounds(start, end, tz);
  const shifts = await prisma.shift.findMany({
    where: { roster: { companyId }, tsStatus: "APPROVED", invoiceId: null, guardId: { not: null }, site: { clientId }, startAt: { gte: from, lt: to } },
    include: { site: { select: { name: true, billRate: true } }, guard: { select: { firstName: true, lastName: true } } },
    orderBy: { startAt: "asc" },
  });
  const unrated = new Set<string>();
  const rows = [];
  for (const s of shifts) {
    if (s.site.billRate === null) { unrated.add(s.site.name); continue; }
    const t = actualTimes(s);
    const hours = Math.round((paidMinutes({ ...t, breakMins: s.breakMins }) / 60) * 100) / 100;
    const rate = Number(s.site.billRate);
    rows.push({
      id: s.id,
      date: formatInTimeZone(t.start, tz, "yyyy-MM-dd"),
      startTime: formatInTimeZone(t.start, tz, "HH:mm"),
      endTime: formatInTimeZone(t.end, tz, "HH:mm"),
      siteName: s.site.name,
      guardName: s.guard ? `${s.guard.firstName} ${s.guard.lastName}` : "",
      role: s.role,
      hours,
      rate,
      amount: Math.round(hours * rate * 100) / 100,
    });
  }
  return { shifts: rows, unratedSites: Array.from(unrated) };
}

export function shiftLineDescription(s: { date: string; startTime: string; endTime: string; siteName: string; role: string | null; guardName: string }) {
  return `${s.date.split("-").reverse().join("/")} — ${s.siteName}, ${s.startTime}–${s.endTime}${s.role ? `, ${s.role}` : ""} (${s.guardName})`;
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
