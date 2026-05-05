import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { siteUpdateSchema } from "@/lib/validators";

async function ensureSiteInCompany(id: string, companyId: string) {
  return prisma.site.findFirst({ where: { id, companyId } });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const site = await prisma.site.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    include: {
      shifts: {
        orderBy: { startAt: "desc" },
        take: 50,
        include: { guard: true },
      },
    },
  });
  if (!site) return jsonError("not found", 404);
  return NextResponse.json(site);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (!(await ensureSiteInCompany(params.id, auth.companyId))) return jsonError("not found", 404);
  const body = await req.json().catch(() => null);
  const parsed = siteUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const site = await prisma.site.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(site);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (!(await ensureSiteInCompany(params.id, auth.companyId))) return jsonError("not found", 404);
  const shiftCount = await prisma.shift.count({ where: { siteId: params.id } });
  if (shiftCount === 0) {
    await prisma.site.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, hardDeleted: true });
  }
  await prisma.site.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ ok: true, hardDeleted: false, shiftCount });
}
