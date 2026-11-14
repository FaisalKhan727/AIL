import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { getAccounting } from "@/lib/server/accounting";
import { redirectUri, xeroConfigured } from "@/lib/integrations/xero";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const [xero, settings, logs, guards] = await Promise.all([
    prisma.integration.findUnique({ where: { companyId_provider: { companyId: auth.companyId, provider: "XERO" } } }),
    getAccounting(auth.companyId),
    prisma.syncLog.findMany({ where: { companyId: auth.companyId }, orderBy: { at: "desc" }, take: 40 }),
    prisma.guard.findMany({ where: { companyId: auth.companyId, active: true }, select: { id: true, firstName: true, lastName: true, externalEmployeeId: true, payrollRef: true } }),
  ]);
  return NextResponse.json({
    xero: {
      configured: xeroConfigured(),
      redirectUri: redirectUri(),
      connected: Boolean(xero?.accessTokenEnc),
      tenantName: xero?.tenantName ?? null,
      connectedAt: xero?.connectedAt ?? null,
      connectedBy: xero?.connectedBy ?? null,
    },
    settings,
    guards: guards.map((g) => ({ id: g.id, name: `${g.firstName} ${g.lastName}`, linked: Boolean(g.externalEmployeeId), payrollRef: g.payrollRef })),
    logs,
  });
}
