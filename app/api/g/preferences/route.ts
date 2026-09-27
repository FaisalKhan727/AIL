import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/guard-auth";

/**
 * GET/PATCH /api/g/preferences
 *
 * Identity-level guard preferences (GuardPreferences) — currently just the
 * push-notifications opt-in surfaced on the Profile tab. Per-company
 * dispatch channel (push vs SMS) is a separate admin-controlled toggle
 * (CompanyAppDispatch); this is the guard's own on/off switch.
 */
export async function GET() {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const prefs = await prisma.guardPreferences.findUnique({
    where: { guardAccountId: guard.guardAccountId },
    select: { notificationsEnabled: true, loneWorkerEnabled: true, language: true },
  });

  return NextResponse.json({
    notificationsEnabled: prefs?.notificationsEnabled ?? true,
    loneWorkerEnabled: prefs?.loneWorkerEnabled ?? true,
    language: prefs?.language ?? "en",
  });
}

const bodySchema = z.object({
  notificationsEnabled: z.boolean(),
});

export async function PATCH(req: Request) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });

  const prefs = await prisma.guardPreferences.upsert({
    where: { guardAccountId: guard.guardAccountId },
    create: { guardAccountId: guard.guardAccountId, notificationsEnabled: parsed.data.notificationsEnabled },
    update: { notificationsEnabled: parsed.data.notificationsEnabled },
  });

  return NextResponse.json({ notificationsEnabled: prefs.notificationsEnabled });
}
