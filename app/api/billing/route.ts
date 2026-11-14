import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { PLANS, planFor } from "@/lib/ops";

// Subscription tier and what the company is using against it. The tier is
// set by Vigilo, so this is read-only.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const companyId = auth.companyId;
  const since = new Date(Date.now() - 180 * 86_400_000);
  const [company, guards, sites, subs, sms] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    prisma.guard.count({ where: { companyId, active: true } }),
    prisma.site.count({ where: { companyId, active: true } }),
    prisma.subcontractor.count({ where: { companyId, status: "ACTIVE" } }),
    prisma.smsLog.findMany({ where: { guard: { companyId }, receivedAt: { gte: since } }, select: { direction: true, status: true, receivedAt: true, body: true } }),
  ]);
  const months = new Map<string, { month: string; outbound: number; inbound: number; failed: number; segments: number }>();
  for (const m of sms) {
    const key = m.receivedAt.toISOString().slice(0, 7);
    const row = months.get(key) ?? { month: key, outbound: 0, inbound: 0, failed: 0, segments: 0 };
    if (m.direction === "OUTBOUND") {
      row.outbound++;
      row.segments += Math.max(1, Math.ceil(m.body.length / 153));
      if (m.status === "failed" || m.status === "undelivered") row.failed++;
    } else row.inbound++;
    months.set(key, row);
  }
  return NextResponse.json({
    plan: planFor(company.plan),
    plans: PLANS,
    usage: { guards, sites, subcontractors: subs },
    sms: Array.from(months.values()).sort((a, b) => b.month.localeCompare(a.month)),
  });
}
