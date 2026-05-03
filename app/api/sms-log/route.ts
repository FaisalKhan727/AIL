import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const guardId = searchParams.get("guardId") || undefined;
  const direction = searchParams.get("direction") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  const logs = await prisma.smsLog.findMany({
    where: {
      ...(guardId ? { guardId } : {}),
      ...(direction ? { direction } : {}),
    },
    include: { guard: true },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
  return NextResponse.json(logs);
}
