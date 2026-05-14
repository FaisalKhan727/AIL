import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard, assertGuardOwnsGuardId } from "@/lib/guard-auth";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const shift = await prisma.shift.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      guardId: true,
      status: true,
      rosterId: true,
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
  if (shift.status !== "PENDING" && shift.status !== "REJECTED") {
    return NextResponse.json(
      { error: `Shift is ${shift.status} — cannot accept` },
      { status: 409 },
    );
  }

  const updated = await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      rejectedAt: null,
      rejectionReason: null,
    },
  });
  return NextResponse.json({ ok: true, status: updated.status });
}
