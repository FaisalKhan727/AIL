import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/guard-auth";

/**
 * GET /api/g/shifts?companyId=X
 *
 * Returns shifts assigned to the signed-in guard, scoped to the requested
 * companyId. If companyId is omitted or "all", returns shifts across every
 * company the guard is a member of.
 *
 * Only returns shifts in PENDING, CONFIRMED, or WORKED status from rosters
 * that are PUBLISHED. DRAFT roster shifts are not visible to guards.
 */
export async function GET(req: Request) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const url = new URL(req.url);
  const requestedCompanyId = url.searchParams.get("companyId");

  let guardIds: string[];
  if (requestedCompanyId && requestedCompanyId !== "all") {
    const membership = guard.memberships.find((m) => m.companyId === requestedCompanyId);
    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of that company" },
        { status: 403 },
      );
    }
    guardIds = [membership.guardId];
  } else {
    guardIds = guard.memberships.map((m) => m.guardId);
  }

  if (guardIds.length === 0) {
    return NextResponse.json({ shifts: [] });
  }

  const now = new Date();
  // Show shifts from 12 hours ago onward — covers in-progress and just-ended.
  const fromDate = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  const shifts = await prisma.shift.findMany({
    where: {
      guardId: { in: guardIds },
      status: { in: ["PENDING", "CONFIRMED", "WORKED"] },
      endAt: { gte: fromDate },
      roster: { status: "PUBLISHED" },
    },
    orderBy: { startAt: "asc" },
    include: {
      site: { select: { id: true, name: true, address: true } },
      roster: { select: { id: true, name: true, companyId: true } },
    },
  });

  // Map guardId → companyId (and name/colour) for the response so the client
  // can render company badges without an extra round-trip.
  const guardIdToMembership = new Map(guard.memberships.map((m) => [m.guardId, m]));

  const response = shifts.map((s) => {
    const m = s.guardId ? guardIdToMembership.get(s.guardId) : undefined;
    return {
      id: s.id,
      startAt: s.startAt,
      endAt: s.endAt,
      role: s.role,
      notes: s.notes,
      status: s.status,
      site: s.site,
      rosterName: s.roster.name,
      company: m
        ? {
            id: m.companyId,
            name: m.companyName,
            brandColour: m.companyBrandColour,
          }
        : null,
    };
  });

  return NextResponse.json({ shifts: response });
}
