import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { phoneE164 } from "@/lib/validators";

const schema = z.object({ contacts: z.array(z.object({ name: z.string().trim().min(1).max(60), phone: phoneE164 })).max(30) });

// Third parties who can be texted from an alarm (police liaison, client
// emergency contact, regional manager…).
export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const value = JSON.stringify(parsed.data.contacts);
  await prisma.setting.upsert({
    where: { companyId_key: { companyId: auth.companyId, key: "alarm_contacts" } },
    update: { value },
    create: { companyId: auth.companyId, key: "alarm_contacts", value },
  });
  return NextResponse.json({ ok: true });
}
