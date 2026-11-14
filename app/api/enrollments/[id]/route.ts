import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const e = await prisma.enrollment.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!e) return jsonError("not found", 404);
  if (e.status === "PASSED") return jsonError("A completed course is part of the guard's training record.", 409);
  await prisma.enrollment.delete({ where: { id: e.id } });
  return NextResponse.json({ ok: true });
}
