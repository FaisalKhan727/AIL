import { NextResponse } from "next/server";
import { z } from "zod";
import { normalisePhone, requestOtp } from "@/lib/guard-otp";

const schema = z.object({ phone: z.string().min(6).max(20) });

// Public: request a sign-in code for the guard app. The answer is the same
// whether or not the number belongs to a guard.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  const phone = parsed.success ? normalisePhone(parsed.data.phone) : null;
  if (!phone) {
    return NextResponse.json({ error: "Enter a valid mobile number, e.g. 0412 345 678" }, { status: 400 });
  }
  const result = await requestOtp(phone);
  if (result === "rate_limited") {
    return NextResponse.json({ error: "Too many codes requested. Try again in an hour." }, { status: 429 });
  }
  if (result === "sms_unavailable") {
    return NextResponse.json({ error: "We couldn't send a code right now. Contact the office." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
