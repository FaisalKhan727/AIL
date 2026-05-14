import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/guard-auth";

interface UnsubscribeBody {
  endpoint?: string;
}

export async function POST(req: Request) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const body = (await req.json().catch(() => null)) as UnsubscribeBody | null;
  if (!body?.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  await prisma.pushSubscription
    .deleteMany({
      where: { endpoint: body.endpoint, guardAccountId: guard.guardAccountId },
    })
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
