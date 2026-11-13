import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireGuard } from "@/lib/api";
import { guardShiftInclude, serialiseGuardShift } from "@/lib/server/guard-app";

const coord = z.number().finite().optional();
const schema = z.object({
  action: z.enum(["confirm", "decline", "clock-in", "clock-out"]),
  reason: z.string().trim().max(200).optional(),
  lat: coord,
  lng: coord,
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const { action, reason, lat, lng } = parsed.data;

  const shift = await prisma.shift.findFirst({
    where: { id: params.id, guardId: auth.guardId, publishedAt: { not: null } },
    include: guardShiftInclude,
  });
  if (!shift) return jsonError("Shift not found", 404);

  const now = new Date();
  const state = serialiseGuardShift(shift, now);
  const hasFix = lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  if (action === "confirm" || action === "decline") {
    if (!state.canRespond) return jsonError("This shift can no longer be changed here. Contact the office.", 409);
    await prisma.shift.update({
      where: { id: shift.id },
      data:
        action === "confirm"
          ? { status: "CONFIRMED", confirmedAt: now, rejectedAt: null, rejectionReason: null }
          : { status: "REJECTED", rejectedAt: now, confirmedAt: null, rejectionReason: reason || "Declined in app" },
    });
  } else if (action === "clock-in") {
    if (!state.canClockIn) {
      return jsonError(
        shift.status !== "CONFIRMED"
          ? "Confirm this shift before clocking in."
          : shift.clockInAt
            ? "You have already clocked in."
            : "You can clock in from 30 minutes before the shift starts.",
        409,
      );
    }
    const open = await prisma.shift.findFirst({
      where: { guardId: auth.guardId, clockInAt: { not: null }, clockOutAt: null, id: { not: shift.id } },
    });
    if (open) return jsonError("Clock out of your current shift first.", 409);
    await prisma.shift.update({
      where: { id: shift.id },
      data: {
        clockInAt: now,
        // Paid time starts at the rostered start: arriving early isn't paid,
        // arriving late is. The true tap time is kept in clockInAt.
        workedStart: now > shift.startAt ? now : shift.startAt,
        ...(hasFix ? { clockInLat: lat, clockInLng: lng } : {}),
      },
    });
  } else {
    if (!state.canClockOut) {
      return jsonError(state.onShift ? "This shift ended too long ago. Ask the office to close it." : "You are not clocked in to this shift.", 409);
    }
    await prisma.shift.update({
      where: { id: shift.id },
      data: {
        clockOutAt: now,
        workedEnd: now,
        status: "WORKED",
        ...(hasFix ? { clockOutLat: lat, clockOutLng: lng } : {}),
      },
    });
  }

  const fresh = await prisma.shift.findUniqueOrThrow({ where: { id: shift.id }, include: guardShiftInclude });
  return NextResponse.json(serialiseGuardShift(fresh));
}
