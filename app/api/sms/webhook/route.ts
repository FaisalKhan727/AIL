import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSmsAdapter } from "@/lib/sms";
import { parseInboundReply, type ParserShift } from "@/lib/sms/parser";
import { buildReplySummary, buildUnparsedReply } from "@/lib/sms/templates";

async function getSetting(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
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

  const guard = await prisma.guard.findUnique({ where: { phone: from } });

  // Always log the inbound, even if guard is unknown.
  await prisma.smsLog.create({
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

  if (!guard) {
    return NextResponse.json({ ok: true, note: "unknown sender" });
  }

  // Find this guard's pending shifts in the most recent published roster.
  const latestRoster = await prisma.roster.findFirst({
    where: {
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
    const reply = buildUnparsedReply(guard.firstName, await getSetting("sms_template_unparsed"));
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

  // Recompute counts for summary.
  const after = await prisma.shift.findMany({
    where: { rosterId: latestRoster.id, guardId: guard.id },
  });
  const confirmedCount = after.filter((s) => s.status === "CONFIRMED").length;
  const rejectedCount = after.filter((s) => s.status === "REJECTED").length;
  const pendingCount = after.filter((s) => s.status === "PENDING").length;

  const summary = buildReplySummary({
    firstName: guard.firstName,
    confirmedCount,
    rejectedCount,
    pendingCount,
    template: await getSetting("sms_template_reply_summary"),
  });
  await adapter.sendSms(guard.phone, summary, { guardId: guard.id });

  return NextResponse.json({
    ok: true,
    parsed: true,
    applied: result.decisions.length,
    summary: { confirmedCount, rejectedCount, pendingCount },
    autoReply: summary,
  });
}
