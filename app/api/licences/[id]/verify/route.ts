import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { licenceType } from "@/lib/licences";
import { getSmsAdapter } from "@/lib/sms";
import { licenceInclude, logEvent, serialiseLicence, syncLegacyGuardFields } from "@/lib/server/licences";

const schema = z
  .object({
    decision: z.enum(["VERIFIED", "REJECTED"]),
    method: z.enum(["MANUAL", "REGISTER", "API"]),
    note: z.string().trim().max(500).optional(),
    notifyGuard: z.boolean().optional(),
  })
  .refine((v) => v.decision === "VERIFIED" || (v.note && v.note.length >= 3), {
    message: "Give a reason when rejecting a licence",
  });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const { decision, method, note, notifyGuard } = parsed.data;

  const l = await prisma.licence.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    include: { guard: true },
  });
  if (!l) return jsonError("not found", 404);

  const actor = auth.session.user.name || "Admin";
  await prisma.licence.update({
    where: { id: l.id },
    data: {
      verification: decision,
      verifiedAt: new Date(),
      verifiedBy: actor,
      verifyMethod: method,
      verifyNote: note || null,
    },
  });
  const methodLabel = { MANUAL: "document sighted", REGISTER: "checked on public register", API: "confirmed by register API" }[method];
  await logEvent(l.id, actor, decision, [methodLabel, note].filter(Boolean).join(" — "));
  await syncLegacyGuardFields(l.guardId);

  // A rejected upload leaves the guard unable to work, so tell them unless
  // the admin opted out. Best-effort: a failed SMS must not undo the decision.
  let smsSent = false;
  if (notifyGuard !== false && decision === "REJECTED") {
    try {
      await getSmsAdapter().sendSms(
        l.guard.phone,
        `Hi ${l.guard.firstName}, we couldn't verify your ${licenceType(l.type).short} (${l.number}). Reason: ${note}. Please contact the office or upload a corrected copy.`,
        { guardId: l.guardId },
      );
      smsSent = true;
    } catch (e) {
      console.error("[licence verify] SMS failed:", e instanceof Error ? e.message : e);
    }
  }

  const full = await prisma.licence.findUniqueOrThrow({ where: { id: l.id }, include: licenceInclude });
  return NextResponse.json({ licence: serialiseLicence(full), smsSent });
}
