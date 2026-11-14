import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { closedJobStatus } from "@/lib/ops";
import { jobInclude } from "@/lib/server/patrol";
import { lookups } from "@/lib/server/ops";
import { getSettingValue } from "@/lib/server/licences";

// One job with everything the runsheet needs.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const job = await prisma.patrolJob.findFirst({ where: { id: params.id, companyId: auth.companyId }, include: jobInclude });
  if (!job) return jsonError("not found", 404);
  const [look, company] = await Promise.all([lookups(auth.companyId), getSettingValue(auth.companyId, "company_name")]);
  return NextResponse.json({ ...job, guardName: look.guardName(job.guardId), companyName: company || "" });
}

const schema = z.object({
  guardId: z.string().nullable().optional(),
  // "close" lets the office finish a job a guard forgot to complete.
  action: z.enum(["close", "reopen"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation", 400);
  const job = await prisma.patrolJob.findFirst({ where: { id: params.id, companyId: auth.companyId }, include: { scans: true } });
  if (!job) return jsonError("not found", 404);
  if (job.invoiceId) return jsonError("This job has been invoiced and can't be changed.", 409);
  const d = parsed.data;

  if (d.guardId !== undefined && d.guardId) {
    const g = await prisma.guard.findFirst({ where: { id: d.guardId, companyId: auth.companyId, active: true } });
    if (!g) return jsonError("guard not found", 404);
  }
  const scanned = job.scans.filter((s) => s.status === "SCANNED").length;
  await prisma.patrolJob.update({
    where: { id: job.id },
    data: {
      guardId: d.guardId === undefined ? undefined : d.guardId || null,
      ...(d.action === "close" ? { status: closedJobStatus(scanned, job.stopCount), completedAt: new Date() } : {}),
      ...(d.action === "reopen" ? { status: job.startedAt ? "ACTIVE" : "SCHEDULED", completedAt: null } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const job = await prisma.patrolJob.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!job) return jsonError("not found", 404);
  if (job.status !== "SCHEDULED") return jsonError("Only jobs that haven't started can be removed.", 409);
  await prisma.patrolJob.delete({ where: { id: job.id } });
  return NextResponse.json({ ok: true });
}
