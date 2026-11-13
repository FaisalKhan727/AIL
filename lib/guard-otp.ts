// One-time SMS codes for signing guards in to the mobile app.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSmsAdapter } from "@/lib/sms";

export { normalisePhone } from "@/lib/phone";

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

function hashCode(phone: string, code: string): string {
  const secret = process.env.NEXTAUTH_SECRET || "";
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export type OtpRequestResult = "sent" | "rate_limited" | "sms_unavailable";

/**
 * Text a sign-in code to `phone` if it belongs to an active guard. Callers
 * must not reveal whether the number was recognised: an unknown number gets
 * the same "sent" answer and simply never receives a message.
 */
export async function requestOtp(phone: string): Promise<OtpRequestResult> {
  const hourAgo = new Date(Date.now() - 3_600_000);
  const recent = await prisma.guardOtp.count({ where: { phone, createdAt: { gte: hourAgo } } });
  if (recent >= MAX_CODES_PER_HOUR) return "rate_limited";

  const guard = await prisma.guard.findFirst({ where: { phone, active: true }, orderBy: { createdAt: "desc" } });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  // Always record the request so the rate limit also applies to numbers we
  // don't know (otherwise it would leak which numbers are guards).
  await prisma.guardOtp.create({
    data: { phone, codeHash: hashCode(phone, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  if (!guard) return "sent";

  try {
    await getSmsAdapter().sendSms(
      phone,
      `${code} is your Vigilo sign-in code. It expires in 10 minutes. Never share it with anyone.`,
      { guardId: guard.id, logBody: "Vigilo sign-in code sent (code not stored)" },
    );
  } catch (e) {
    console.error("[guard-otp] could not send code:", e instanceof Error ? e.message : e);
    return "sms_unavailable";
  }
  return "sent";
}

/** True when `code` is the newest unused, unexpired code for `phone`. Single use. */
export async function consumeOtp(phone: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const otp = await prisma.guardOtp.findFirst({
    where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) return false;

  const expected = Buffer.from(otp.codeHash, "hex");
  const given = Buffer.from(hashCode(phone, code), "hex");
  const ok = expected.length === given.length && timingSafeEqual(expected, given);

  await prisma.guardOtp.update({
    where: { id: otp.id },
    data: ok ? { usedAt: new Date() } : { attempts: { increment: 1 } },
  });
  return ok;
}
