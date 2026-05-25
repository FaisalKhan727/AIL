import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

const bodySchema = z.object({
  onsiteAt: z.string().datetime(),
  offsiteAt: z.string().datetime(),
  result: z.string().trim().min(1).max(500),
});

/**
 * POST /api/alarms/[id]/manual-complete
 *
 * Admin records the responder's onsite/offsite/result manually — used
 * when the responder phoned in the response instead of texting back, or
 * when the inbound SMS parser got the times wrong and admin is editing.
 *
 * Behaviour:
 *  - Updates the most recently dispatched AlarmResponder's onsiteAt,
 *    offsiteAt, responseResult fields.
 *  - Sets responseRawBody to "[manual entry by admin]" so audit shows
 *    this didn't come from SMS parsing.
 *  - Marks the AlarmJob status = COMPLETED + resolvedAt = now.
 *  - Idempotent: re-running with new times overwrites the existing
 *    response fields and keeps the job COMPLETED.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const alarm = await prisma.alarmJob.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    include: {
      responders: { orderBy: { dispatchedAt: "desc" }, take: 1 },
    },
  });
  if (!alarm) return jsonError("not found", 404);
  if (alarm.responders.length === 0) {
    return jsonError("no responder on this alarm to attach the response to", 400);
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("validation", 400, parsed.error.flatten());
  }
  const { onsiteAt, offsiteAt, result } = parsed.data;

  const onsite = new Date(onsiteAt);
  const offsite = new Date(offsiteAt);
  if (offsite.getTime() <= onsite.getTime()) {
    return jsonError("offsite time must be after onsite time", 400);
  }

  const latestResponder = alarm.responders[0];
  await prisma.$transaction([
    prisma.alarmResponder.update({
      where: { id: latestResponder.id },
      data: {
        onsiteAt: onsite,
        offsiteAt: offsite,
        responseResult: result,
        responseRawBody: "[manual entry by admin]",
      },
    }),
    prisma.alarmJob.update({
      where: { id: alarm.id },
      data: { status: "COMPLETED", resolvedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
