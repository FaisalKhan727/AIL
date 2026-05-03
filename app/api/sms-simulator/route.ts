import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";

// Returns the guard's latest published roster shifts (with index + confirmCode)
// so the simulator UI can show what numbers/codes the guard's reply should reference.
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const guardId = searchParams.get("guardId");
  if (!guardId) return NextResponse.json({ shifts: [] });

  const roster = await prisma.roster.findFirst({
    where: { status: "PUBLISHED", shifts: { some: { guardId } } },
    orderBy: { publishedAt: "desc" },
  });
  if (!roster) return NextResponse.json({ roster: null, shifts: [] });

  const shifts = await prisma.shift.findMany({
    where: { rosterId: roster.id, guardId },
    orderBy: { startAt: "asc" },
    include: { site: true },
  });

  return NextResponse.json({
    roster: { id: roster.id, name: roster.name },
    shifts: shifts.map((s, i) => ({
      id: s.id,
      index: i + 1,
      confirmCode: s.confirmCode,
      status: s.status,
      startAt: s.startAt,
      endAt: s.endAt,
      siteName: s.site.name,
      role: s.role,
    })),
  });
}
