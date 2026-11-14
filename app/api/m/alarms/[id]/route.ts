import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireGuard } from "@/lib/api";

// The dispatched guard reports their own progress to the control room.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const parsed = z.object({ action: z.enum(["en-route", "on-scene"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation", 400);
  const alarm = await prisma.alarm.findFirst({ where: { id: params.id, guardId: auth.guardId, status: { not: "RESOLVED" } } });
  if (!alarm) return jsonError("This dispatch is no longer assigned to you.", 404);
  const guard = await prisma.guard.findUniqueOrThrow({ where: { id: auth.guardId } });
  const actor = `${guard.firstName} ${guard.lastName}`;
  if (parsed.data.action === "en-route") {
    if (alarm.status !== "DISPATCHED") return NextResponse.json({ ok: true });
    await prisma.alarm.update({ where: { id: alarm.id }, data: { status: "EN_ROUTE", events: { create: { actor, text: "Acknowledged — en route" } } } });
  } else {
    if (alarm.status === "ON_SCENE") return NextResponse.json({ ok: true });
    await prisma.alarm.update({
      where: { id: alarm.id },
      data: { status: "ON_SCENE", onSceneAt: new Date(), verification: alarm.verification === "UNVERIFIED" ? "GUARD_CONFIRMED" : alarm.verification, events: { create: { actor, text: "On scene" } } },
    });
  }
  return NextResponse.json({ ok: true });
}
