import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

// Set exactly which sites belong to this client.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = z.object({ siteIds: z.array(z.string()) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation", 400);
  const client = await prisma.client.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!client) return jsonError("not found", 404);
  await prisma.$transaction([
    prisma.site.updateMany({ where: { companyId: auth.companyId, clientId: client.id, id: { notIn: parsed.data.siteIds } }, data: { clientId: null } }),
    prisma.site.updateMany({ where: { companyId: auth.companyId, id: { in: parsed.data.siteIds } }, data: { clientId: client.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
