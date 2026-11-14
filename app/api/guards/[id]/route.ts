import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { guardUpdateSchema } from "@/lib/validators";
import { adoptLegacyLicence, licenceInclude, serialiseLicence } from "@/lib/server/licences";

async function ensureGuardInCompany(id: string, companyId: string) {
  const g = await prisma.guard.findFirst({ where: { id, companyId } });
  return g;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const guard = await prisma.guard.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    include: {
      shifts: {
        orderBy: { startAt: "desc" },
        take: 50,
        include: { site: true, roster: true },
      },
      smsLogs: { orderBy: { receivedAt: "desc" }, take: 50 },
      licences: { include: licenceInclude, orderBy: { expiryDate: "asc" } },
    },
  });
  if (!guard) return jsonError("not found", 404);
  return NextResponse.json({ ...guard, licences: guard.licences.map((l) => serialiseLicence(l)) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (!(await ensureGuardInCompany(params.id, auth.companyId))) return jsonError("not found", 404);
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
        employmentType: data.employmentType,
        payrollRef: data.payrollRef,
        notes: data.notes,
        active: data.active,
      },
    });
    await adoptLegacyLicence(
      auth.companyId,
      guard.id,
      data.licenceNumber,
      data.licenceExpiry ? new Date(data.licenceExpiry) : undefined,
      auth.session.user.name || "Admin",
    );
    return NextResponse.json(guard);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "update failed";
    return jsonError(msg, 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (!(await ensureGuardInCompany(params.id, auth.companyId))) return jsonError("not found", 404);
  try {
    const shiftCount = await prisma.shift.count({ where: { guardId: params.id } });
    if (shiftCount === 0) {
      // No history — safe to hard delete (also clean up any orphaned SmsLog rows).
      await prisma.smsLog.deleteMany({ where: { guardId: params.id } });
      await prisma.guard.delete({ where: { id: params.id } });
      return NextResponse.json({ ok: true, hardDeleted: true });
    }
    // Has shift history — soft delete to preserve timesheets and audit trail.
    await prisma.guard.update({ where: { id: params.id }, data: { active: false } });
    return NextResponse.json({ ok: true, hardDeleted: false, shiftCount });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "delete failed";
    return jsonError(msg, 500);
  }
}
