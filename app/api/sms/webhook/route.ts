import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSmsAdapter } from "@/lib/sms";
import { parseInboundReply, type ParserShift } from "@/lib/sms/parser";
import { buildUnparsedReply, buildAlarmAutoReply } from "@/lib/sms/templates";
import { parseAlarmReply, combineHHmmWithDispatch } from "@/lib/alarms/parser";

async function getSetting(companyId: string, key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key } },
  });
  return row?.value;
}

async function readPayload(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await req.json()) as Record<string, string>;
  }
  // Twilio posts application/x-www-form-urlencoded by default.
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

export async function POST(req: Request) {
  const adapter = getSmsAdapter();

  // Clone the request so adapter can re-read the body if needed.
  const cloned = req.clone();
  const verified = await adapter.verifyInboundSignature(cloned).catch(() => false);
  if (!verified) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const payload = await readPayload(req);
  const from = (payload.From || "").trim();
  const to = (payload.To || "").trim();
  const body = (payload.Body || "").trim();
  const providerSid = payload.MessageSid || null;

  if (!from) return NextResponse.json({ error: "missing From" }, { status: 400 });

  // The same phone may exist as separate Guard records in multiple companies
  // (Auswide and ACS can both roster the same person). When that happens, route
  // the reply to whichever company most recently sent that phone an outbound
  // SMS — that's almost always the message they're replying to.
  const candidates = await prisma.guard.findMany({ where: { phone: from } });
  let guard: typeof candidates[number] | null = candidates[0] ?? null;
  if (candidates.length > 1) {
    let bestTime = -1;
    for (const c of candidates) {
      const lastOut = await prisma.smsLog.findFirst({
        where: { guardId: c.id, direction: "OUTBOUND" },
        orderBy: { receivedAt: "desc" },
      });
      const t = lastOut?.receivedAt.getTime() ?? 0;
      if (t > bestTime) {
        bestTime = t;
        guard = c;
      }
    }
  }

  // Always log the inbound, even if guard is unknown.
  const inboundLog = await prisma.smsLog.create({
    data: {
      guardId: guard?.id,
      direction: "INBOUND",
      fromNumber: from,
      toNumber: to,
      body,
      providerSid,
      status: "received",
    },
  });

  // ALARM-FIRST ROUTING ----------------------------------------------------
  // Confirmed priority: an inbound SMS from a phone that has a pending alarm
  // dispatch is treated as an alarm response BEFORE falling through to roster
  // confirmation logic. If no pending alarm, the existing roster flow runs
  // exactly as before — zero behaviour change for the roster path.
  const pendingResponder = await prisma.alarmResponder.findFirst({
    where: {
      externalPhone: from,
      declinedAt: null,
      alarmJob: { status: { in: ["DISPATCHED", "ACKNOWLEDGED"] } },
    },
    include: { alarmJob: true },
    orderBy: { dispatchedAt: "desc" },
  });
  if (pendingResponder) {
    await handleAlarmReply({
      body,
      responder: pendingResponder,
      inboundLogId: inboundLog.id,
      from,
    });
    return NextResponse.json({ ok: true, route: "alarm", docket: pendingResponder.alarmJob.docket });
  }
  // ---------------------------------------------------------------------

  if (!guard) {
    return NextResponse.json({ ok: true, note: "unknown sender" });
  }

  // Find this guard's pending shifts in the most recent published roster
  // (within the guard's own company — multi-tenant safety).
  const latestRoster = await prisma.roster.findFirst({
    where: {
      companyId: guard.companyId,
      status: "PUBLISHED",
      shifts: { some: { guardId: guard.id } },
    },
    orderBy: { publishedAt: "desc" },
  });

  if (!latestRoster) {
    return NextResponse.json({ ok: true, note: "no published roster for guard" });
  }

  const guardShifts = await prisma.shift.findMany({
    where: { rosterId: latestRoster.id, guardId: guard.id },
    orderBy: { startAt: "asc" },
  });

  const pendingShifts: ParserShift[] = guardShifts
    .map((s, i) => ({ shiftId: s.id, index: i + 1, confirmCode: s.confirmCode, status: s.status }))
    .filter((s) => s.status === "PENDING")
    .map(({ shiftId, index, confirmCode }) => ({ shiftId, index, confirmCode }));

  const result = parseInboundReply(body, pendingShifts);

  if (result.status === "unparsed") {
    const reply = buildUnparsedReply(guard.firstName, await getSetting(guard.companyId, "sms_template_unparsed"));
    await adapter.sendSms(guard.phone, reply, { guardId: guard.id });
    return NextResponse.json({ ok: true, parsed: false, reason: result.reason });
  }

  // Apply decisions.
  const now = new Date();
  for (const d of result.decisions) {
    if (d.decision === "YES") {
      await prisma.shift.update({
        where: { id: d.shiftId },
        data: { status: "CONFIRMED", confirmedAt: now, rejectedAt: null, rejectionReason: null },
      });
    } else {
      await prisma.shift.update({
        where: { id: d.shiftId },
        data: { status: "REJECTED", rejectedAt: now, confirmedAt: null },
      });
    }
  }

  // Recompute counts (kept in the response payload for admin debugging /
  // future analytics; the confirmation auto-reply SMS is intentionally
  // NOT sent to save Twilio credits — admin verifies via the calendar
  // and the guard sees the change reflected in the PWA).
  const after = await prisma.shift.findMany({
    where: { rosterId: latestRoster.id, guardId: guard.id },
  });
  const confirmedCount = after.filter((s) => s.status === "CONFIRMED").length;
  const rejectedCount = after.filter((s) => s.status === "REJECTED").length;
  const pendingCount = after.filter((s) => s.status === "PENDING").length;

  return NextResponse.json({
    ok: true,
    parsed: true,
    applied: result.decisions.length,
    summary: { confirmedCount, rejectedCount, pendingCount },
    autoReply: null,
  });
}

// ---------------------------------------------------------------------------
// Alarm reply handling — invoked when an inbound SMS matches a pending
// AlarmResponder. Updates DB, sends auto-reply where appropriate, links
// the inbound SmsLog to the alarm context.
// ---------------------------------------------------------------------------

type PendingResponderRow = Awaited<
  ReturnType<typeof prisma.alarmResponder.findFirst<{ include: { alarmJob: true } }>>
>;

async function handleAlarmReply(args: {
  body: string;
  responder: NonNullable<PendingResponderRow>;
  inboundLogId: string;
  from: string;
}): Promise<void> {
  const { body, responder, inboundLogId, from } = args;
  const adapter = getSmsAdapter();
  const result = parseAlarmReply(body);

  // Link the inbound log to the alarm context regardless of parse outcome.
  await prisma.smsLog.update({
    where: { id: inboundLogId },
    data: { alarmJobId: responder.alarmJobId, alarmResponderId: responder.id },
  });

  if (result.kind === "complete") {
    const onsiteAt = combineHHmmWithDispatch(result.onsiteHHmm, responder.dispatchedAt);
    const offsiteAt = combineHHmmWithDispatch(result.offsiteHHmm, responder.dispatchedAt);
    // If offsite < onsite (crossed midnight reported in shifted order), push offsite a day.
    const offsiteAdjusted =
      offsiteAt.getTime() < onsiteAt.getTime()
        ? new Date(offsiteAt.getTime() + 24 * 3600_000)
        : offsiteAt;

    await prisma.$transaction([
      prisma.alarmResponder.update({
        where: { id: responder.id },
        data: {
          onsiteAt,
          offsiteAt: offsiteAdjusted,
          responseResult: result.resultText,
          responseRawBody: body,
          responseSmsLogId: inboundLogId,
        },
      }),
      prisma.alarmJob.update({
        where: { id: responder.alarmJobId },
        data: { status: "COMPLETED", resolvedAt: new Date() },
      }),
    ]);

    const replyBody = buildAlarmAutoReply("completed", responder.alarmJob.docket);
    await adapter.sendSms(from, replyBody, {});
    // PDF generation hook (step 8) lands here — left as a TODO comment so
    // the trigger point is obvious when that step ships.
    // await generateAlarmReport(responder.alarmJobId);
    return;
  }

  if (result.kind === "acknowledged") {
    await prisma.$transaction([
      prisma.alarmResponder.update({
        where: { id: responder.id },
        data: { acknowledgedAt: new Date(), responseRawBody: body, responseSmsLogId: inboundLogId },
      }),
      prisma.alarmJob.update({
        where: { id: responder.alarmJobId },
        data: { status: responder.alarmJob.status === "DISPATCHED" ? "ACKNOWLEDGED" : responder.alarmJob.status },
      }),
    ]);
    const replyBody = buildAlarmAutoReply("acknowledged");
    await adapter.sendSms(from, replyBody, {});
    return;
  }

  if (result.kind === "declined") {
    await prisma.alarmResponder.update({
      where: { id: responder.id },
      data: { declinedAt: new Date(), responseRawBody: body, responseSmsLogId: inboundLogId },
    });
    // Admin SMS notification lands in step 9. For now, log only.
    console.log(
      `[alarm webhook] responder declined docket #${responder.alarmJob.docket}: ${from}`,
    );
    return;
  }

  // unparsed — store raw and ask for the right format
  await prisma.alarmResponder.update({
    where: { id: responder.id },
    data: { responseRawBody: body, responseSmsLogId: inboundLogId },
  });
  const replyBody = buildAlarmAutoReply("unparsed");
  await adapter.sendSms(from, replyBody, {});
}
