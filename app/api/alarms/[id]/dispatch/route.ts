import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { dispatchAlarmSms } from "@/lib/alarms/dispatch";
import { phoneE164 } from "@/lib/validators";

const internalSchema = z.object({
  type: z.literal("INTERNAL_GUARD"),
  guardId: z.string().min(1),
});
const externalSchema = z.object({
  type: z.literal("EXTERNAL_CONTRACTOR"),
  name: z.string().trim().min(1),
  phone: phoneE164,
  company: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
});
const bodySchema = z.union([internalSchema, externalSchema]);

/**
 * POST /api/alarms/[id]/dispatch
 *
 * Send the alarm to a DIFFERENT responder. Additive — creates a new
 * AlarmResponder row alongside any existing ones (the original responder
 * stays in history). Useful when the first responder declines or doesn't
 * reply and admin needs to escalate.
 *
 * dispatchAlarmSms() handles the push-vs-SMS channel decision for the
 * new responder same as the initial dispatch.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const alarm = await prisma.alarmJob.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    select: { id: true, status: true },
  });
  if (!alarm) return jsonError("not found", 404);
  if (alarm.status === "CANCELLED") {
    return jsonError("Cannot dispatch on a cancelled alarm", 409);
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("validation", 400, parsed.error.flatten());
  }
  const data = parsed.data;

  if (data.type === "INTERNAL_GUARD") {
    const guard = await prisma.guard.findFirst({
      where: { id: data.guardId, companyId: auth.companyId },
      select: { id: true, phone: true },
    });
    if (!guard) return jsonError("guard not in this company", 400);
  }

  // Create the new responder + bump existing AlarmContact's lastUsedAt
  // if external phone matches one.
  const responder = await prisma.$transaction(async (tx) => {
    const r = await tx.alarmResponder.create({
      data: {
        alarmJobId: alarm.id,
        companyId: auth.companyId,
        responderType: data.type,
        guardId: data.type === "INTERNAL_GUARD" ? data.guardId : undefined,
        externalName: data.type === "EXTERNAL_CONTRACTOR" ? data.name : undefined,
        externalPhone:
          data.type === "INTERNAL_GUARD"
            ? ""
            : data.phone,
        externalCompany:
          data.type === "EXTERNAL_CONTRACTOR" ? data.company : undefined,
      },
    });
    if (data.type === "INTERNAL_GUARD") {
      const g = await tx.guard.findUnique({
        where: { id: data.guardId },
        select: { phone: true },
      });
      await tx.alarmResponder.update({
        where: { id: r.id },
        data: { externalPhone: g?.phone ?? "" },
      });
    } else {
      await tx.alarmContact
        .update({
          where: {
            companyId_phone: { companyId: auth.companyId, phone: data.phone },
          },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => undefined);
    }
    // Flip the alarm back to DISPATCHED so the inbound parser routes the
    // new responder's reply correctly (it only matches DISPATCHED /
    // ACKNOWLEDGED states).
    await tx.alarmJob.update({
      where: { id: alarm.id },
      data: { status: "DISPATCHED" },
    });
    return r;
  });

  const result = await dispatchAlarmSms(responder.id);
  return NextResponse.json({
    ok: result.ok,
    channel: result.channel,
    responderId: responder.id,
    error: result.error,
  });
}
