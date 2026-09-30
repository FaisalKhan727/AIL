import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyGuardLicence } from "@/lib/licence/verify";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
// LARS refuses connections from Vercel's default US region; run lookups from Sydney.
export const preferredRegion = "syd1";

const RECHECK_AFTER_DAYS = 7;
const BATCH_SIZE = 20; // keeps each run well inside maxDuration
const DELAY_MS = 1_000; // be gentle with the LARS register

// Daily re-verification of active guards' licences (see vercel.json).
// Picks the least-recently-checked guards so the whole roster cycles through
// every RECHECK_AFTER_DAYS; failed lookups are retried on the next run.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const staleBefore = new Date(Date.now() - RECHECK_AFTER_DAYS * 86_400_000);
  const guards = await prisma.guard.findMany({
    where: {
      active: true,
      licenceNumber: { not: null },
      OR: [
        { licenceCheckedAt: null },
        { licenceCheckedAt: { lt: staleBefore } },
        { licenceCheckStatus: "ERROR" },
      ],
    },
    select: { id: true },
    orderBy: { licenceCheckedAt: { sort: "asc", nulls: "first" } },
    take: BATCH_SIZE,
  });

  const counts: Record<string, number> = {};
  for (const [i, g] of guards.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    const outcome = await verifyGuardLicence(g.id);
    if (outcome) counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
  }
  return NextResponse.json({ checked: guards.length, counts });
}
