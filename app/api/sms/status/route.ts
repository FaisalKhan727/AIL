import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSmsAdapter } from "@/lib/sms";

// Twilio status callback. Updates the matching OUTBOUND SmsLog by providerSid.
export async function POST(req: Request) {
  const adapter = getSmsAdapter();

  const cloned = req.clone();
  const verified = await adapter.verifyInboundSignature(cloned).catch(() => false);
  if (!verified) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const ct = req.headers.get("content-type") || "";
  let payload: Record<string, string> = {};
  if (ct.includes("application/json")) {
    payload = (await req.json().catch(() => ({}))) as Record<string, string>;
  } else {
    const text = await req.text();
    for (const [k, v] of new URLSearchParams(text)) payload[k] = v;
  }

  const sid = payload.MessageSid;
  const status = payload.MessageStatus;
  const errorCode = payload.ErrorCode || null;

  if (sid && status) {
    await prisma.smsLog.updateMany({
      where: { providerSid: sid },
      data: { status, errorCode },
    });
  }

  return NextResponse.json({ ok: true, received: status ?? null });
}
