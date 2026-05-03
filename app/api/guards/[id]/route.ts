import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { guardUpdateSchema } from "@/lib/validators";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const guard = await prisma.guard.findUnique({
    where: { id: params.id },
    include: {
      shifts: {
        orderBy: { startAt: "desc" },
        take: 50,
        include: { site: true, roster: true },
      },
      smsLogs: { orderBy: { receivedAt: "desc" }, take: 50 },
    },
  });
  if (!guard) return jsonError("not found", 404);
  return NextResponse.json(guard);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  const parsed = guardUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const data = parsed.data;
  try {
    const guard = await prisma.guard.update({
      where: { id: params.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        licenceNumber: data.licenceNumber,
        licenceExpiry: data.licenceExpiry ? new Date(data.licenceExpiry) : undefined,
        payRate: data.payRate?.toString(),
        notes: data.notes,
        active: data.active,
      },
    });
    return NextResponse.json(guard);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "update failed";
    return jsonError(msg, 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  // Soft delete: mark inactive instead of hard-deleting (preserves shift history).
  try {
    await prisma.guard.update({ where: { id: params.id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "delete failed";
    return jsonError(msg, 500);
  }
}
