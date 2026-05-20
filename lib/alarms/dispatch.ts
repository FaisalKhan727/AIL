import { prisma } from "@/lib/prisma";
import { getSmsAdapter } from "@/lib/sms";
import { buildAlarmMessage } from "@/lib/sms/templates";
import { pickChannelForGuard, sendPushToGuardAccount } from "@/lib/push/dispatch";

/**
 * Send the alarm to a responder. Picks the channel automatically:
 *
 *   INTERNAL_GUARD + active PWA + push subscription  → push notification
 *   INTERNAL_GUARD without app                       → SMS
 *   EXTERNAL_CONTRACTOR                              → SMS
 *
 * Push failures fall back to SMS for that delivery (same pattern as the
 * roster dispatch). Idempotent at the API level — calling twice fires
 * a second notification; the most recent dispatch wins for the inbound
 * parser via the AlarmResponder.dispatchedAt ordering.
 *
 * Returns ok + the channel actually used. Caller surfaces this to admin
 * so they can see whether the responder got push or SMS.
 *
 * (Function name kept as dispatchAlarmSms to avoid touching every caller;
 * the contract now covers both channels.)
 */
export async function dispatchAlarmSms(alarmResponderId: string): Promise<{
  ok: boolean;
  channel: "push" | "sms";
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
    return { ok: false, channel: "sms", smsLogId: null, error: "AlarmResponder not found" };
  }

  // Resolve the destination phone: internal guards use Guard.phone;
  // external contractors use externalPhone (already stored on the row).
  const toPhone =
    responder.responderType === "INTERNAL_GUARD" && responder.guard
      ? responder.guard.phone
      : responder.externalPhone;
  if (!toPhone) {
    return { ok: false, channel: "sms", smsLogId: null, error: "Responder has no phone number" };
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

  // -------------------------------------------------------------------------
  // Push path — INTERNAL_GUARD with active app subscription.
  // -------------------------------------------------------------------------
  if (responder.responderType === "INTERNAL_GUARD" && responder.guardId) {
    try {
      const channel = await pickChannelForGuard(responder.guardId);
      if (channel.channel === "PUSH") {
        const pushRes = await sendPushToGuardAccount(channel.guardAccountId, {
          title: `${job.priority} ALARM #${job.docket}`,
          body,
          url: "/g",
          data: {
            type: "alarm_dispatch",
            alarmJobId: job.id,
            docket: job.docket,
            alarmType: job.alarmType,
            priority: job.priority,
          },
          tag: `alarm-${job.id}`,
        });
        if (pushRes.ok) {
          await prisma.alarmResponder.update({
            where: { id: responder.id },
            data: { dispatchedAt: new Date() },
          });
          return { ok: true, channel: "push", smsLogId: null };
        }
        // Push had subscriptions but every send failed → fall through to SMS.
      }
    } catch (err) {
      // pickChannelForGuard / sendPushToGuardAccount threw (VAPID missing,
      // network, etc.). Log and fall back to SMS so dispatch never fails
      // because of the push side.
      console.error(
        `[alarm dispatch] push threw for guard ${responder.guardId}, falling back to SMS:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // -------------------------------------------------------------------------
  // SMS path — external contractors, internal guards without the app,
  // or push fallthrough from above.
  // -------------------------------------------------------------------------
  const adapter = getSmsAdapter();
  try {
    const res = await adapter.sendSms(toPhone, body, {
      guardId: responder.guardId ?? undefined,
    });

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

    return {
      ok: true,
      channel: "sms",
      smsLogId: log?.id ?? null,
      error: res.status === "failed" ? "twilio reported failed" : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, channel: "sms", smsLogId: null, error: message };
  }
}
