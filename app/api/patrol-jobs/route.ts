import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { jobBillable } from "@/lib/ops";
import { zDate, zOptId } from "@/lib/server/crud";
import { dateOnly, lookups } from "@/lib/server/ops";
import { jobInclude } from "@/lib/server/patrol";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const sp = new URL(req.url).searchParams;
  const now = Date.now();
  const from = sp.get("from") ? dateOnly(sp.get("from") as string) : new Date(now - 14 * 86_400_000);
  const to = sp.get("to") ? dateOnly(sp.get("to") as string) : new Date(now + 14 * 86_400_000);
  const [jobs, look] = await Promise.all([
    prisma.patrolJob.findMany({ where: { companyId: auth.companyId, date: { gte: from, lte: to } }, include: jobInclude, orderBy: [{ date: "desc" }, { run: { code: "asc" } }] }),
    lookups(auth.companyId),
  ]);
  return NextResponse.json({
    jobs: jobs.map((j) => {
      const scanned = j.scans.filter((s) => s.status === "SCANNED").length;
      return {
        ...j,
        guardName: look.guardName(j.guardId),
        scanned,
        missed: j.scans.filter((s) => s.status === "MISSED").length,
        billable: jobBillable({ status: j.status, rate: Number(j.rate), stopCount: j.stopCount, scanned }),
      };
    }),
    guards: look.guards.filter((g) => g.active).map((g) => ({ id: g.id, name: g.name })),
  });
}

const schema = z.object({ runId: z.string().min(1), date: zDate, guardId: zOptId });

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const d = parsed.data;
  const [run, guard, clash] = await Promise.all([
    prisma.patrolRun.findFirst({ where: { id: d.runId, companyId: auth.companyId }, include: { stops: true } }),
    d.guardId ? prisma.guard.findFirst({ where: { id: d.guardId, companyId: auth.companyId, active: true } }) : null,
    prisma.patrolJob.findFirst({ where: { runId: d.runId, date: d.date } }),
  ]);
  if (!run) return jsonError("run not found", 404);
  if (d.guardId && !guard) return jsonError("guard not found", 404);
  if (run.stops.length === 0) return jsonError("This run has no stops yet.", 400);
  if (clash) return jsonError(`${run.code} is already scheduled for that date.`, 409);
  const job = await prisma.patrolJob.create({
    data: { companyId: auth.companyId, runId: run.id, date: d.date, guardId: d.guardId ?? null, stopCount: run.stops.length, rate: run.rate },
  });
  return NextResponse.json(job, { status: 201 });
}
