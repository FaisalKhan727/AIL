import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard, assertGuardOwnsGuardId } from "@/lib/guard-auth";

/**
 * GET /api/g/shifts/[id]
 *
 * Returns one shift with the fields the detail page needs:
 * site (full), roster, company, status timestamps for the timeline.
 *
 * Strict tenant isolation via assertGuardOwnsGuardId — the signed-in
 * guard must own the Guard row this shift is assigned to.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const shift = await prisma.shift.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      guardId: true,
      startAt: true,
      endAt: true,
      role: true,
      notes: true,
      status: true,
      publishedAt: true,
      confirmedAt: true,
      rejectedAt: true,
      rejectionReason: true,
      workedStart: true,
      workedEnd: true,
      createdAt: true,
      site: { select: { id: true, name: true, address: true } },
      roster: {
        select: {
          id: true,
          name: true,
          companyId: true,
          status: true,
          company: { select: { id: true, name: true, brandColour: true } },
        },
      },
    },
  });
  if (!shift || !shift.guardId) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }
  const ownership = assertGuardOwnsGuardId(guard, shift.guardId);
  if (ownership) return ownership;
  if (shift.roster.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Shift not yet published" }, { status: 404 });
  }

  return NextResponse.json({
    id: shift.id,
    startAt: shift.startAt,
    endAt: shift.endAt,
    role: shift.role,
    notes: shift.notes,
    status: shift.status,
    site: shift.site,
    rosterName: shift.roster.name,
    company: shift.roster.company,
    timeline: {
      publishedAt: shift.publishedAt,
      confirmedAt: shift.confirmedAt,
      rejectedAt: shift.rejectedAt,
      rejectionReason: shift.rejectionReason,
      workedStart: shift.workedStart,
      workedEnd: shift.workedEnd,
    },
  });
}
