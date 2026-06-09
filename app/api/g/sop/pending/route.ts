import { NextResponse } from "next/server";
import { requireGuard } from "@/lib/guard-auth";
import { getPendingReackForGuard } from "@/lib/onboarding/sop";

/**
 * GET /api/g/sop/pending
 *
 * For the signed-in guard, returns any SOP versions across their
 * memberships that they need to (re-)acknowledge. The PWA polls this
 * on every page load via the banner component.
 *
 * Response:
 *   { pending: [{ companyId, companyName, sop: { id, title, body, version } }] }
 *
 * Empty array = nothing to ack, the banner hides itself.
 */
export async function GET() {
  const ctx = await requireGuard();
  if (!ctx.ok) return ctx.response;

  const pending: Array<{
    companyId: string;
    companyName: string;
    guardId: string;
    sop: { id: string; title: string; body: string; version: number };
  }> = [];

  for (const m of ctx.guard.memberships) {
    const sop = await getPendingReackForGuard(m.guardId, m.companyId);
    if (sop) {
      pending.push({
        companyId: m.companyId,
        companyName: m.companyName,
        guardId: m.guardId,
        sop,
      });
    }
  }

  return NextResponse.json({ pending });
}
