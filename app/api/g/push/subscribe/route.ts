import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/guard-auth";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  deviceLabel?: string;
}

export async function POST(req: Request) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const body = (await req.json().catch(() => null)) as SubscribeBody | null;
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json(
      { error: "Missing endpoint or keys" },
      { status: 400 },
    );
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: {
      guardAccountId: guard.guardAccountId,
      endpoint: body.endpoint,
      p256dhKey: body.keys.p256dh,
      authKey: body.keys.auth,
      deviceLabel: body.deviceLabel?.slice(0, 100) ?? null,
    },
    update: {
      guardAccountId: guard.guardAccountId,
      p256dhKey: body.keys.p256dh,
      authKey: body.keys.auth,
      deviceLabel: body.deviceLabel?.slice(0, 100) ?? null,
      failureCount: 0,
    },
  });

  // Make sure appActivated is true once a subscription exists.
  await prisma.guardAccount.update({
    where: { id: guard.guardAccountId },
    data: { appActivated: true },
  });

  return NextResponse.json({ ok: true });
}
