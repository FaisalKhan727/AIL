import { NextResponse } from "next/server";

// Twilio status callback. In mock mode this is a no-op; in live mode you can
// update SmsLog by providerSid here once you implement the Twilio adapter.
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";
  let payload: Record<string, string> = {};
  if (ct.includes("application/json")) {
    payload = (await req.json().catch(() => ({}))) as Record<string, string>;
  } else {
    const text = await req.text();
    const params = new URLSearchParams(text);
    for (const [k, v] of params) payload[k] = v;
  }
  // TODO (twilio): update SmsLog where providerSid === payload.MessageSid
  return NextResponse.json({ ok: true, received: payload.MessageStatus ?? null });
}
