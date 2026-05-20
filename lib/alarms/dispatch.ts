import { prisma } from "@/lib/prisma";
import { getSmsAdapter } from "@/lib/sms";
import { buildAlarmMessage } from "@/lib/sms/templates";

/**
 * Send the outbound alarm SMS to a responder and link the SmsLog row to
 * the AlarmJob + AlarmResponder. Idempotent at the API level — calling
 * twice creates two SmsLog rows (intentional; reflects two real send
 * attempts) but the second call overwrites dispatchSmsLogId on the
 * responder so the most recent dispatch is the authoritative one.
 *
 * Returns whether the underlying Twilio call reported success. Caller
 * decides whether to surface the failure to admin or schedule a retry.
 */
export async function dispatchAlarmSms(alarmResponderId: string): Promise<{
  ok: boolean;
  smsLogId: string | null;
  error?: string;
}> {
  const responder = await prisma.alarmResponder.findUnique({
    where: { id: alarmResponderId },
    include: {
      alarmJob: true,
      guard: { select: { firstName: true, lastName: true, phone: true } },
    },
  });
  if (!responder) {
    return { ok: false, smsLogId: null, error: "AlarmResponder not found" };
  }

  // Resolve the destination phone: internal guards use Guard.phone;
  // external contractors use externalPhone (already stored on the row).
  const toPhone =
    responder.responderType === "INTERNAL_GUARD" && responder.guard
      ? responder.guard.phone
      : responder.externalPhone;
  if (!toPhone) {
    return { ok: false, smsLogId: null, error: "Responder has no phone number" };
  }

  const job = responder.alarmJob;
  const body = buildAlarmMessage({
    docket: job.docket,
    alarmType: job.alarmType,
    priority: job.priority,
    siteName: job.siteName,
    siteAddress: job.siteAddress,
    description: job.description,
    specialInstructions: job.specialInstructions,
  });

  const adapter = getSmsAdapter();
  try {
    const res = await adapter.sendSms(toPhone, body, {
      guardId: responder.guardId ?? undefined,
      // Twilio adapter's OutboundMeta only knows guardId/shiftId today;
      // alarmJobId/alarmResponderId are attached to SmsLog separately
      // below so SmsLog filtering by alarm still works.
    });

    // Find the SmsLog row the adapter just wrote (the most-recent OUTBOUND
    // to this number) and attach alarm linkage. This is a cleaner shape
    // than threading new meta fields through every adapter implementation.
    const log = await prisma.smsLog.findFirst({
      where: { toNumber: toPhone, direction: "OUTBOUND", alarmJobId: null },
      orderBy: { receivedAt: "desc" },
    });
    if (log) {
      await prisma.smsLog.update({
        where: { id: log.id },
        data: { alarmJobId: job.id, alarmResponderId: responder.id },
      });
    }

    await prisma.alarmResponder.update({
      where: { id: responder.id },
      data: { dispatchedAt: new Date(), dispatchSmsLogId: log?.id ?? null },
    });

    return { ok: true, smsLogId: log?.id ?? null, error: res.status === "failed" ? "twilio reported failed" : undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, smsLogId: null, error: message };
  }
}
