import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { rosterCreateSchema } from "@/lib/validators";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const rosters = await prisma.roster.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { shifts: true } } },
  });
  // Add confirmation rates
  const enriched = await Promise.all(
    rosters.map(async (r) => {
      const counts = await prisma.shift.groupBy({
        by: ["status"],
        where: { rosterId: r.id },
        _count: { _all: true },
      });
      const total = counts.reduce((a, c) => a + c._count._all, 0);
      const confirmed = counts.find((c) => c.status === "CONFIRMED")?._count._all ?? 0;
      const rejected = counts.find((c) => c.status === "REJECTED")?._count._all ?? 0;
      return {
        ...r,
        shiftCount: total,
        confirmedCount: confirmed,
        rejectedCount: rejected,
        confirmationPct: total > 0 ? Math.round((confirmed / total) * 100) : 0,
      };
    }),
  );
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
    },
  });
  return NextResponse.json(roster, { status: 201 });
}
