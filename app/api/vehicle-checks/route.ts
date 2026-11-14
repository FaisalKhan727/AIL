import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";

// Pre-shift vehicle checks submitted from the guard app, newest first.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const checks = await prisma.vehicleCheck.findMany({
    where: { companyId: auth.companyId },
    include: { vehicle: { select: { code: true, rego: true } } },
    orderBy: { at: "desc" },
    take: 200,
  });
  const guardIds = Array.from(new Set(checks.map((c) => c.guardId).filter((x): x is string => Boolean(x))));
  const guards = await prisma.guard.findMany({ where: { id: { in: guardIds } }, select: { id: true, firstName: true, lastName: true } });
  const names = new Map(guards.map((g) => [g.id, `${g.firstName} ${g.lastName}`]));
  return NextResponse.json(checks.map((c) => ({ ...c, guardName: c.guardId ? names.get(c.guardId) ?? "—" : "—" })));
}
