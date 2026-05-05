import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { dispatchRosterSms } from "@/lib/sms/dispatch";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const roster = await prisma.roster.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    include: { shifts: true },
  });
  if (!roster) return jsonError("not found", 404);

  // Validation: no shifts in the past, no overlapping shifts per guard.
  const now = new Date();
  const past = roster.shifts.filter((s) => s.startAt < now);
  if (past.length > 0) {
    return jsonError("cannot publish: some shifts start in the past", 400, {
      shifts: past.map((s) => s.id),
    });
  }

  const byGuard = new Map<string, { id: string; startAt: Date; endAt: Date }[]>();
  for (const s of roster.shifts) {
    const list = byGuard.get(s.guardId) ?? [];
    list.push({ id: s.id, startAt: s.startAt, endAt: s.endAt });
    byGuard.set(s.guardId, list);
  }
  const conflicts: { guardId: string; shiftIds: string[] }[] = [];
  for (const [guardId, list] of byGuard) {
    list.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    for (let i = 1; i < list.length; i++) {
      if (list[i].startAt < list[i - 1].endAt) {
        conflicts.push({ guardId, shiftIds: [list[i - 1].id, list[i].id] });
      }
    }
  }
  if (conflicts.length > 0) {
    return jsonError("cannot publish: overlapping shifts detected", 400, { conflicts });
  }

  await prisma.roster.update({
    where: { id: params.id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });

  const dispatched = await dispatchRosterSms(params.id);
  const sent = dispatched.filter((d) => d.ok).length;
  const failed = dispatched.filter((d) => !d.ok);

  return NextResponse.json({
    ok: true,
    sent,
    failedCount: failed.length,
    failed,
    dispatched,
  });
}
