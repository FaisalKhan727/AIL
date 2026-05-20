import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { dispatchAlarmSms } from "@/lib/alarms/dispatch";

/**
 * POST /api/alarms/[id]/resend
 * Re-dispatch the alarm to the most recent responder. Uses the same
 * channel decision as the initial dispatch (push for INTERNAL_GUARD
 * with app, SMS otherwise) — so a guard who's since activated the app
 * will get a push on the second send even if the first was SMS.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
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
    return jsonError("no responder to resend to — send to a different responder instead", 400);
  }

  const result = await dispatchAlarmSms(alarm.responders[0].id);
  return NextResponse.json({
    ok: result.ok,
    channel: result.channel,
    error: result.error,
  });
}
