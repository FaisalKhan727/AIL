import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { preChecks } from "@/lib/licences";
import { checkRegister } from "@/lib/licence-register";
import { findDuplicateHolder, logEvent } from "@/lib/server/licences";

// Runs the automatic checks for one licence and (where the state offers an
// API) looks it up on the regulator's register. It never changes the
// licence's verification — an admin does that with /verify after reviewing.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const l = await prisma.licence.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    include: { guard: true },
  });
  if (!l) return jsonError("not found", 404);

  const duplicate = await findDuplicateHolder(auth.companyId, l);
  const checks = preChecks(l, duplicate);
  const register = await checkRegister({
    type: l.type,
    number: l.number,
    state: l.state,
    expiryDate: l.expiryDate,
    guardFirstName: l.guard.firstName,
    guardLastName: l.guard.lastName,
  });

  // Only log lookups that actually reached a register; "MANUAL" just means
  // we told the operator where to look.
  if (register.outcome !== "MANUAL") {
    await logEvent(l.id, auth.session.user.name || "Admin", "REGISTER_CHECK", `${register.source}: ${register.summary}`);
  }

  return NextResponse.json({ checks, register });
}
