import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { shiftUpdateSchema } from "@/lib/validators";

async function ensureShiftInCompany(id: string, companyId: string) {
  return prisma.shift.findFirst({
    where: { id, roster: { companyId } },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (!(await ensureShiftInCompany(params.id, auth.companyId))) return jsonError("not found", 404);
  const body = await req.json().catch(() => null);
  const parsed = shiftUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const data = parsed.data;

  if (data.guardId) {
    const guardOk = await prisma.guard.findFirst({ where: { id: data.guardId, companyId: auth.companyId } });
    if (!guardOk) return jsonError("guard not in this company", 400);
  }
  if (data.siteId) {
    const siteOk = await prisma.site.findFirst({ where: { id: data.siteId, companyId: auth.companyId } });
    if (!siteOk) return jsonError("site not in this company", 400);
  }

  const shift = await prisma.shift.update({
    where: { id: params.id },
    data: {
      guardId: data.guardId,
      siteId: data.siteId,
      startAt: data.startAt ? new Date(data.startAt) : undefined,
      endAt: data.endAt ? new Date(data.endAt) : undefined,
      role: data.role,
      notes: data.notes,
      status: data.status,
      workedStart: data.workedStart ? new Date(data.workedStart) : undefined,
      workedEnd: data.workedEnd ? new Date(data.workedEnd) : undefined,
    },
  });
  return NextResponse.json(shift);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (!(await ensureShiftInCompany(params.id, auth.companyId))) return jsonError("not found", 404);
  await prisma.shift.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
