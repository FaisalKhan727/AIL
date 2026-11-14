import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { actorName } from "@/lib/server/crud";

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(2000) });

// Approve many timesheets at once. Ones already in a pay run are skipped.
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation", 400);
  const r = await prisma.shift.updateMany({
    where: { id: { in: parsed.data.ids }, roster: { companyId: auth.companyId }, guardId: { not: null }, payRunId: null, tsStatus: { not: "APPROVED" } },
    data: { tsStatus: "APPROVED", tsApprovedAt: new Date(), tsApprovedBy: actorName(auth), status: "WORKED" },
  });
  return NextResponse.json({ approved: r.count });
}
