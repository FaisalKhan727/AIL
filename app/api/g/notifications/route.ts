import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/guard-auth";
import { getPendingReackForGuard } from "@/lib/onboarding/sop";

/**
 * GET /api/g/notifications
 *
 * Backs the guard PWA's Alerts tab: anything that needs the guard's
 * attention right now (pending SOP re-acks, shifts awaiting a response),
 * plus a short recent-messages history. There's no persisted notification
 * log for push sends today (they're fire-and-forget), so "recent" here is
 * the guard's own outbound SMS history — real data, not a fabricated feed.
 */
export async function GET() {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const guardIds = guard.memberships.map((m) => m.guardId);

  const [pendingSopEntries, pendingShifts, recentMessages] = await Promise.all([
    Promise.all(
      guard.memberships.map(async (m) => {
        const sop = await getPendingReackForGuard(m.guardId, m.companyId);
        return sop ? { companyId: m.companyId, companyName: m.companyName, sop } : null;
      }),
    ),
    guardIds.length === 0
      ? []
      : prisma.shift.findMany({
          where: { guardId: { in: guardIds }, status: "PENDING", roster: { status: "PUBLISHED" } },
          orderBy: { startAt: "asc" },
          select: {
            id: true,
            guardId: true,
            startAt: true,
            endAt: true,
            role: true,
            status: true,
            workedStart: true,
            workedEnd: true,
            site: { select: { id: true, name: true, address: true } },
          },
        }),
    guardIds.length === 0
      ? []
      : prisma.smsLog.findMany({
          where: { guardId: { in: guardIds }, direction: "OUTBOUND" },
          orderBy: { receivedAt: "desc" },
          take: 20,
          select: { id: true, body: true, receivedAt: true, status: true },
        }),
  ]);

  const guardIdToMembership = new Map(guard.memberships.map((m) => [m.guardId, m]));
  const pendingShiftRows = pendingShifts.map((s) => {
    const m = s.guardId ? guardIdToMembership.get(s.guardId) : undefined;
    return {
      id: s.id,
      startAt: s.startAt,
      endAt: s.endAt,
      role: s.role,
      status: s.status,
      workedStart: s.workedStart,
      workedEnd: s.workedEnd,
      site: s.site,
      company: m ? { id: m.companyId, name: m.companyName, brandColour: m.companyBrandColour } : null,
    };
  });

  return NextResponse.json({
    pendingSop: pendingSopEntries.filter((e): e is NonNullable<typeof e> => e !== null),
    pendingShifts: pendingShiftRows,
    recentMessages,
  });
}
