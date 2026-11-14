import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

// Set exactly which guards are supplied by this subcontractor.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = z.object({ guardIds: z.array(z.string()) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation", 400);
  const sub = await prisma.subcontractor.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!sub) return jsonError("not found", 404);
  await prisma.$transaction([
    prisma.guard.updateMany({ where: { companyId: auth.companyId, subcontractorId: sub.id, id: { notIn: parsed.data.guardIds } }, data: { subcontractorId: null } }),
    prisma.guard.updateMany({ where: { companyId: auth.companyId, id: { in: parsed.data.guardIds } }, data: { subcontractorId: sub.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
