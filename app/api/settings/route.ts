import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { getSmsMode } from "@/lib/sms";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const rows = await prisma.setting.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  // Add read-only environment view (mask Twilio creds).
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const from = process.env.TWILIO_FROM_NUMBER || "";
  const masked = sid ? `${sid.slice(0, 6)}…${sid.slice(-4)}` : "";
  return NextResponse.json({
    settings: map,
    sms: {
      mode: getSmsMode(),
      twilioSidMasked: masked,
      twilioFromNumber: from,
    },
  });
}

const updateSchema = z.record(z.string(), z.string());

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const entries = Object.entries(parsed.data);
  for (const [key, value] of entries) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return NextResponse.json({ ok: true, updated: entries.length });
}
