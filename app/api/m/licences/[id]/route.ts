import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireGuard } from "@/lib/api";
import { syncLegacyGuardFields } from "@/lib/server/licences";

// Guards can withdraw their own upload while it is still waiting on the
// office. Anything already verified or rejected is part of the record.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const l = await prisma.licence.findFirst({ where: { id: params.id, guardId: auth.guardId } });
  if (!l) return jsonError("not found", 404);
  if (l.source !== "GUARD" || l.verification !== "UNVERIFIED") {
    return jsonError("Only uploads that are still awaiting verification can be removed.", 409);
  }
  await prisma.licence.delete({ where: { id: l.id } });
  await syncLegacyGuardFields(auth.guardId);
  return NextResponse.json({ ok: true });
}
