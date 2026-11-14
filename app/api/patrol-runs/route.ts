import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { refsOk, runInclude, runSchema } from "@/lib/server/patrol";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const runs = await prisma.patrolRun.findMany({ where: { companyId: auth.companyId }, include: runInclude, orderBy: [{ active: "desc" }, { code: "asc" }] });
  return NextResponse.json(runs);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = runSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const { stops, ...d } = parsed.data;
  if (!(await refsOk(auth.companyId, d))) return jsonError("client or vehicle not found", 400);
  const run = await prisma.patrolRun.create({
    data: {
      ...d,
      companyId: auth.companyId,
      stops: { create: stops.map((s, i) => ({ position: i, name: s.name, address: s.address ?? null, instructions: s.instructions ?? null })) },
    },
    include: runInclude,
  });
  return NextResponse.json(run, { status: 201 });
}
