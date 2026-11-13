import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/api";
import { guardCompliance } from "@/lib/licences";
import { guardShiftInclude, serialiseGuardShift } from "@/lib/server/guard-app";

export async function GET() {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const now = new Date();

  const guard = await prisma.guard.findUniqueOrThrow({
    where: { id: auth.guardId },
    include: { company: true, licences: true },
  });
  const [nameSetting, upcoming, active, pending, others] = await Promise.all([
    prisma.setting.findUnique({ where: { companyId_key: { companyId: auth.companyId, key: "company_name" } } }),
    prisma.shift.findMany({
      where: { guardId: auth.guardId, publishedAt: { not: null }, status: { in: ["PENDING", "CONFIRMED"] }, endAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 3,
      include: guardShiftInclude,
    }),
    prisma.shift.findFirst({
      where: { guardId: auth.guardId, clockInAt: { not: null }, clockOutAt: null },
      orderBy: { clockInAt: "desc" },
      include: guardShiftInclude,
    }),
    prisma.shift.count({
      where: { guardId: auth.guardId, publishedAt: { not: null }, status: "PENDING", startAt: { gte: now } },
    }),
    // Same mobile number on another company's books: offer a switch.
    prisma.guard.findMany({
      where: { phone: guard.phone, active: true, id: { not: guard.id } },
      include: { company: true },
    }),
  ]);

  return NextResponse.json({
    guard: { id: guard.id, firstName: guard.firstName, lastName: guard.lastName, phone: guard.phone, email: guard.email },
    companyName: nameSetting?.value || guard.company.name,
    otherCompanies: others.map((g) => ({ guardId: g.id, companyName: g.company.name })),
    compliance: guardCompliance(guard.licences, now),
    pendingCount: pending,
    activeShift: active ? serialiseGuardShift(active, now) : null,
    upcoming: upcoming.map((s) => serialiseGuardShift(s, now)),
  });
}
