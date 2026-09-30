import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyGuardLicence } from "@/lib/licence/verify";

// Fluid compute allows up to 300s on every plan.
export const maxDuration = 300;
export const dynamic = "force-dynamic";
// LARS refuses connections from Vercel's default US region; run lookups from Sydney.
export const preferredRegion = "syd1";

// Anything not checked in the last 20h is due, so a once-a-day run re-checks
// every guard even when Vercel fires the cron a little early or late.
const RECHECK_AFTER_HOURS = 20;
const TIME_BUDGET_MS = 250_000; // a lookup can take 30s (2 × 15s timeout); finish inside maxDuration
const CONCURRENCY = 2; // be gentle with the LARS register
const DELAY_MS = 500; // pause between lookups, per worker

// Daily re-verification of every active guard's licence (see vercel.json).
// Least-recently-checked first, so if the roster ever outgrows one run's time
// budget, whoever is skipped goes first the next night.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const staleBefore = new Date(startedAt - RECHECK_AFTER_HOURS * 3_600_000);
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
  });

  const counts: Record<string, number> = {};
  let next = 0;
  async function worker() {
    while (next < guards.length && Date.now() - startedAt < TIME_BUDGET_MS) {
      const g = guards[next++];
      const outcome = await verifyGuardLicence(g.id);
      if (outcome) counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const checked = Math.min(next, guards.length);
  const remaining = guards.length - checked;
  if (remaining > 0) console.warn(`[cron/licence-check] time budget reached, ${remaining} guards left for tomorrow`);
  return NextResponse.json({ checked, remaining, counts });
}
