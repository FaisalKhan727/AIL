import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireGuard, assertGuardOwnsGuardId } from "@/lib/guard-auth";

const bodySchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

/**
 * POST /api/g/shifts/[id]/clock-in
 *
 * Records a CLOCK_IN ClockEvent and sets Shift.workedStart. Allowed only
 * when the shift is CONFIRMED and not yet started (workedStart is null).
 *
 * GPS is optional — the client passes lat/lng if the user granted
 * location permission; absence is not an error in v1. No 30-min window
 * enforcement yet (admin can clock in early/late).
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
      roster: { select: { status: true, companyId: true } },
    },
  });
  if (!shift || !shift.guardId) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }
  const ownership = assertGuardOwnsGuardId(guard, shift.guardId);
  if (ownership) return ownership;
  if (shift.roster.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Shift not yet published" }, { status: 400 });
  }
  if (shift.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: `Cannot clock in — shift is ${shift.status}. Accept it first.` },
      { status: 409 },
    );
  }
  if (shift.workedStart) {
    return NextResponse.json({ error: "Already clocked in" }, { status: 409 });
  }

  const now = new Date();
  const [, updated] = await prisma.$transaction([
    prisma.clockEvent.create({
      data: {
        shiftId: shift.id,
        guardId: shift.guardId,
        companyId: shift.roster.companyId,
        eventType: "CLOCK_IN",
        timestamp: now,
        latitude: parsed.data.latitude ?? undefined,
        longitude: parsed.data.longitude ?? undefined,
        source: "GUARD_APP",
      },
    }),
    prisma.shift.update({
      where: { id: shift.id },
      data: { workedStart: now },
      select: { id: true, status: true, workedStart: true, workedEnd: true },
    }),
  ]);

  return NextResponse.json({ ok: true, shift: updated });
}
