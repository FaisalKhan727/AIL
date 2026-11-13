import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { alertMessage, daysUntilExpiry, dueAlertThreshold } from "@/lib/licences";
import { getSmsAdapter } from "@/lib/sms";
import { logEvent } from "@/lib/server/licences";

export const dynamic = "force-dynamic";

// Daily job (see vercel.json): text guards whose credentials are about to
// lapse, at 60 / 30 / 14 / 7 / 0 days and again a week after expiry. Each
// threshold is sent once per licence. Companies can switch reminders off
// with the `compliance_reminders` setting.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const optedOut = new Set(
    (await prisma.setting.findMany({ where: { key: "compliance_reminders", value: "false" } })).map((s) => s.companyId),
  );
  const horizon = new Date(Date.now() + 61 * 86_400_000);
  const candidates = await prisma.licence.findMany({
    where: { expiryDate: { not: null, lte: horizon }, verification: { not: "REJECTED" }, guard: { active: true } },
    include: { guard: true },
  });

  const appUrl = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  const now = new Date();
  let sent = 0;
  let failed = 0;

  for (const l of candidates) {
    if (optedOut.has(l.companyId) || !l.expiryDate) continue;
    const daysLeft = daysUntilExpiry(l.expiryDate, now);
    const threshold = dueAlertThreshold(daysLeft, l.lastAlertDays);
    if (threshold === null || daysLeft === null) continue;

    // A renewal already on file (a later-dated licence of the same type)
    // means there's nothing to chase.
    const renewed = await prisma.licence.findFirst({
      where: { guardId: l.guardId, type: l.type, id: { not: l.id }, expiryDate: { gt: l.expiryDate } },
    });
    if (renewed) {
      await prisma.licence.update({ where: { id: l.id }, data: { lastAlertDays: threshold } });
      continue;
    }

    try {
      await getSmsAdapter().sendSms(
        l.guard.phone,
        alertMessage(l.guard.firstName, l.type, l.expiryDate, daysLeft, appUrl),
        { guardId: l.guardId },
      );
      await prisma.licence.update({ where: { id: l.id }, data: { lastAlertDays: threshold } });
      await logEvent(l.id, "System", "ALERT", threshold < 0 ? "Lapsed reminder sent" : `${threshold}-day expiry reminder sent`);
      sent++;
    } catch (e) {
      failed++;
      console.error("[licence-alerts] send failed:", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ checked: candidates.length, sent, failed });
}
