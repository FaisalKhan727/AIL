import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/guard-auth";
import { VAPID_PUBLIC_KEY } from "@/lib/push/vapid";

/**
 * GET /api/g/home?companyId=X
 *
 * Combined endpoint for the Guard PWA home screen. Returns everything
 * the page needs in ONE round-trip — identity + memberships +
 * vapidPublicKey + shifts.
 *
 * Replaces the previous /api/g/me + /api/g/shifts cascade on the home
 * page (~600-1000ms cold-start savings on first open; halves request
 * count when warm).
 *
 * Other pages (/g/timesheets, /g/shifts/[id]) still call their own
 * narrow endpoints — they don't need shifts on mount.
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

  const now = new Date();
  const fromDate = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  // Shifts query — empty array if guard has no Guard rows yet.
  const shifts =
    guardIds.length === 0
      ? []
      : await prisma.shift.findMany({
          where: {
            guardId: { in: guardIds },
            status: { in: ["PENDING", "CONFIRMED", "WORKED"] },
            endAt: { gte: fromDate },
            roster: { status: "PUBLISHED" },
          },
          orderBy: { startAt: "asc" },
          select: {
            id: true,
            guardId: true,
            startAt: true,
            endAt: true,
            role: true,
            notes: true,
            status: true,
            workedStart: true,
            workedEnd: true,
            site: { select: { id: true, name: true, address: true } },
            roster: { select: { id: true, name: true, companyId: true } },
          },
        });

  const guardIdToMembership = new Map(guard.memberships.map((m) => [m.guardId, m]));

  const shiftRows = shifts.map((s) => {
    const m = s.guardId ? guardIdToMembership.get(s.guardId) : undefined;
    return {
      id: s.id,
      startAt: s.startAt,
      endAt: s.endAt,
      role: s.role,
      notes: s.notes,
      status: s.status,
      workedStart: s.workedStart,
      workedEnd: s.workedEnd,
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

  return NextResponse.json({
    identity: {
      id: guard.guardIdentityId,
      firstName: guard.firstName,
      lastName: guard.lastName,
      phone: guard.phone,
    },
    memberships: guard.memberships,
    vapidPublicKey: VAPID_PUBLIC_KEY,
    shifts: shiftRows,
  });
}
