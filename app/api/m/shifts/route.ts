import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/api";
import { guardShiftInclude, serialiseGuardShift } from "@/lib/server/guard-app";

// A guard's own published shifts: everything still to come, plus the last
// five weeks of history.
export async function GET() {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const now = new Date();
  const since = new Date(now.getTime() - 35 * 86_400_000);
  const shifts = await prisma.shift.findMany({
    where: { guardId: auth.guardId, publishedAt: { not: null }, status: { not: "CANCELLED" }, endAt: { gte: since } },
    orderBy: { startAt: "asc" },
    include: guardShiftInclude,
  });
  const all = shifts.map((s) => serialiseGuardShift(s, now));
  return NextResponse.json({
    upcoming: all.filter((s) => new Date(s.endAt) >= now || s.onShift),
    past: all.filter((s) => new Date(s.endAt) < now && !s.onShift).reverse(),
  });
}
