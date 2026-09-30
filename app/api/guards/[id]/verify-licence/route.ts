import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { verifyGuardLicence } from "@/lib/licence/verify";

export const maxDuration = 60;
// LARS refuses connections from Vercel's default US region; run lookups from Sydney.
export const preferredRegion = "syd1";

// Manual "Verify with LARS" from the guard page.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const guard = await prisma.guard.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    select: { licenceNumber: true },
  });
  if (!guard) return jsonError("not found", 404);
  if (!guard.licenceNumber) return jsonError("Guard has no licence number", 400);
  const outcome = await verifyGuardLicence(params.id);
  return NextResponse.json(outcome);
}
