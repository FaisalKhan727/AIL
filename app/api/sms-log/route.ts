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

  // Slim guard include to just name + id — the SMS log page only
  // renders guard.firstName + lastName. Full include shipped payRate,
  // email, notes etc. that were never displayed.
  const logs = await prisma.smsLog.findMany({
    where: {
      guard: { companyId: auth.companyId },
      ...(guardId ? { guardId } : {}),
      ...(direction ? { direction } : {}),
    },
    select: {
      id: true,
      guardId: true,
      shiftId: true,
      direction: true,
      fromNumber: true,
      toNumber: true,
      body: true,
      providerSid: true,
      status: true,
      errorCode: true,
      receivedAt: true,
      guard: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
  return NextResponse.json(logs);
}
