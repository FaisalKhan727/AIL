import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { refsOk, runInclude, runSchema } from "@/lib/server/patrol";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const run = await prisma.patrolRun.findFirst({ where: { id: params.id, companyId: auth.companyId }, include: { stops: true } });
  if (!run) return jsonError("not found", 404);
  const parsed = runSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const { stops, ...d } = parsed.data;
  if (!(await refsOk(auth.companyId, d))) return jsonError("client or vehicle not found", 400);

  await prisma.$transaction(async (tx) => {
    await tx.patrolRun.update({ where: { id: run.id }, data: d });
    if (!stops) return;
    // Keep existing stop ids where the editor sent them back, so scans on
    // jobs already in progress still line up; drop the rest.
    const keep = new Set(stops.map((s) => s.id).filter(Boolean));
    await tx.patrolStop.deleteMany({ where: { runId: run.id, id: { notIn: Array.from(keep) as string[] } } });
    for (const [i, s] of stops.entries()) {
      const data = { position: i, name: s.name, address: s.address ?? null, instructions: s.instructions ?? null };
      if (s.id && run.stops.some((x) => x.id === s.id)) await tx.patrolStop.update({ where: { id: s.id }, data });
      else await tx.patrolStop.create({ data: { ...data, runId: run.id } });
    }
  });
  const fresh = await prisma.patrolRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
  return NextResponse.json(fresh);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const run = await prisma.patrolRun.findFirst({ where: { id: params.id, companyId: auth.companyId }, include: { _count: { select: { jobs: true } } } });
  if (!run) return jsonError("not found", 404);
  if (run._count.jobs > 0) return jsonError("This run has job history. Make it inactive instead of deleting it.", 409);
  await prisma.patrolRun.delete({ where: { id: run.id } });
  return NextResponse.json({ ok: true });
}
