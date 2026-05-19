import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { rosterCreateSchema } from "@/lib/validators";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const rosters = await prisma.roster.findMany({
    where: { companyId: auth.companyId },
    orderBy: { startDate: "desc" },
  });

  // One combined groupBy across ALL rosters, not one per roster (was N+1).
  // For a company with 100 rosters this drops from 101 round-trips to 2.
  const counts = rosters.length === 0
    ? []
    : await prisma.shift.groupBy({
        by: ["rosterId", "status"],
        where: { rosterId: { in: rosters.map((r) => r.id) } },
        _count: { _all: true },
      });

  // Build a per-roster status histogram from the flat groupBy result.
  const histogram = new Map<string, { total: number; confirmed: number; rejected: number }>();
  for (const c of counts) {
    const h = histogram.get(c.rosterId) ?? { total: 0, confirmed: 0, rejected: 0 };
    h.total += c._count._all;
    if (c.status === "CONFIRMED") h.confirmed += c._count._all;
    else if (c.status === "REJECTED") h.rejected += c._count._all;
    histogram.set(c.rosterId, h);
  }

  const enriched = rosters.map((r) => {
    const h = histogram.get(r.id) ?? { total: 0, confirmed: 0, rejected: 0 };
    return {
      ...r,
      shiftCount: h.total,
      confirmedCount: h.confirmed,
      rejectedCount: h.rejected,
      confirmationPct: h.total > 0 ? Math.round((h.confirmed / h.total) * 100) : 0,
    };
  });
  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  const parsed = rosterCreateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const data = parsed.data;
  const roster = await prisma.roster.create({
    data: {
      name: data.name,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      companyId: auth.companyId,
    },
  });
  return NextResponse.json(roster, { status: 201 });
}
