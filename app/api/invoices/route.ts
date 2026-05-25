import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { getRateForSource, distinctSources, getAllRates, setRateForSource } from "@/lib/invoices/rates";

/**
 * GET /api/invoices
 * Returns the company's generated invoices (most recent first) plus
 * the per-source rate table and the list of distinct alarm sources
 * (for the rate-config UI on the page).
 */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const [invoices, rates, sources] = await Promise.all([
    prisma.alarmInvoice.findMany({
      where: { companyId: auth.companyId },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { source: "asc" }],
    }),
    getAllRates(auth.companyId),
    distinctSources(auth.companyId),
  ]);

  return NextResponse.json({
    invoices: invoices.map((i) => ({
      id: i.id,
      source: i.source,
      periodYear: i.periodYear,
      periodMonth: i.periodMonth,
      alarmCount: i.alarmCount,
      ratePerAlarm: Number(i.ratePerAlarm),
      totalAmount: Number(i.totalAmount),
      generatedAt: i.generatedAt,
    })),
    rates,
    sources,
  });
}

const generateSchema = z.object({
  source: z.string().trim().min(1),
  periodYear: z.number().int().min(2020).max(2100),
  periodMonth: z.number().int().min(1).max(12),
});

/**
 * POST /api/invoices
 * Generate an invoice for one (source, year, month). Snapshots the
 * matching alarms at generation time so totals are stable. Unique-per-
 * (company, source, year, month) — re-running overwrites the prior
 * snapshot via upsert.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const raw = await req.json().catch(() => null);
  const parsed = generateSchema.safeParse(raw);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const { source, periodYear, periodMonth } = parsed.data;

  const rate = await getRateForSource(auth.companyId, source);

  // Period bounds in the company's local time — we use server UTC since
  // alarms.receivedAt is stored UTC and the month grouping is admin-facing
  // (close enough to local in this single-region setup).
  const periodStart = new Date(Date.UTC(periodYear, periodMonth - 1, 1));
  const periodEnd = new Date(Date.UTC(periodYear, periodMonth, 1));

  const alarms = await prisma.alarmJob.findMany({
    where: {
      companyId: auth.companyId,
      source,
      receivedAt: { gte: periodStart, lt: periodEnd },
      // Only bill completed work. Cancelled / no_response don't get charged.
      status: { in: ["COMPLETED", "ACKNOWLEDGED", "ONSITE"] },
    },
    select: { id: true },
    orderBy: { receivedAt: "asc" },
  });
  const alarmIds = alarms.map((a) => a.id);
  const alarmCount = alarmIds.length;
  const totalAmount = Math.round(alarmCount * rate * 100) / 100;

  const invoice = await prisma.alarmInvoice.upsert({
    where: {
      companyId_source_periodYear_periodMonth: {
        companyId: auth.companyId,
        source,
        periodYear,
        periodMonth,
      },
    },
    create: {
      companyId: auth.companyId,
      source,
      periodYear,
      periodMonth,
      alarmIds: JSON.stringify(alarmIds),
      alarmCount,
      ratePerAlarm: rate.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      generatedBy: auth.userId,
    },
    update: {
      alarmIds: JSON.stringify(alarmIds),
      alarmCount,
      ratePerAlarm: rate.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      generatedBy: auth.userId,
      generatedAt: new Date(),
    },
  });

  return NextResponse.json({
    id: invoice.id,
    alarmCount,
    ratePerAlarm: rate,
    totalAmount,
  });
}

const setRateSchema = z.object({
  source: z.string().trim().min(1),
  rate: z.number().min(0).max(100000),
});

/**
 * PATCH /api/invoices — convenience endpoint to set a per-source rate.
 * (Kept here so the /invoices page doesn't need a separate /settings call.)
 */
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const raw = await req.json().catch(() => null);
  const parsed = setRateSchema.safeParse(raw);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  await setRateForSource(auth.companyId, parsed.data.source, parsed.data.rate);
  return NextResponse.json({ ok: true });
}
