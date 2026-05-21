import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireGuard, assertGuardOwnsGuardId } from "@/lib/guard-auth";

const bodySchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/g/shifts/[id]/clock-out
 *
 * Records a CLOCK_OUT ClockEvent, sets Shift.workedEnd, and flips the
 * shift status to WORKED. Allowed only when workedStart is set and
 * workedEnd is null (i.e., the guard is currently clocked in for this
 * shift).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  const shift = await prisma.shift.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      guardId: true,
      status: true,
      workedStart: true,
      workedEnd: true,
      roster: { select: { companyId: true } },
    },
  });
  if (!shift || !shift.guardId) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }
  const ownership = assertGuardOwnsGuardId(guard, shift.guardId);
  if (ownership) return ownership;
  if (!shift.workedStart) {
    return NextResponse.json({ error: "Not clocked in yet" }, { status: 409 });
  }
  if (shift.workedEnd) {
    return NextResponse.json({ error: "Already clocked out" }, { status: 409 });
  }

  const now = new Date();
  const [, updated] = await prisma.$transaction([
    prisma.clockEvent.create({
      data: {
        shiftId: shift.id,
        guardId: shift.guardId,
        companyId: shift.roster.companyId,
        eventType: "CLOCK_OUT",
        timestamp: now,
        latitude: parsed.data.latitude ?? undefined,
        longitude: parsed.data.longitude ?? undefined,
        notes: parsed.data.notes,
        source: "GUARD_APP",
      },
    }),
    prisma.shift.update({
      where: { id: shift.id },
      data: { workedEnd: now, status: "WORKED" },
      select: { id: true, status: true, workedStart: true, workedEnd: true },
    }),
  ]);

  return NextResponse.json({ ok: true, shift: updated });
}
