import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import {
  licenceInclude,
  licenceUpdateSchema,
  logEvent,
  parseDateOnly,
  saveDocument,
  serialiseLicence,
  syncLegacyGuardFields,
} from "@/lib/server/licences";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const l = await prisma.licence.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    include: { ...licenceInclude, events: { orderBy: { at: "desc" }, take: 50 } },
  });
  if (!l) return jsonError("not found", 404);
  return NextResponse.json({ ...serialiseLicence(l), events: l.events });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const existing = await prisma.licence.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!existing) return jsonError("not found", 404);

  const parsed = licenceUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "validation", 400, parsed.error.flatten());
  }
  const d = parsed.data;
  const actor = auth.session.user.name || "Admin";

  const next = {
    type: d.type ?? existing.type,
    number: d.number ?? existing.number,
    state: d.state ?? existing.state,
    issueDate: d.issueDate !== undefined ? parseDateOnly(d.issueDate) : existing.issueDate,
    expiryDate: d.expiryDate !== undefined ? parseDateOnly(d.expiryDate) : existing.expiryDate,
  };
  // A verification vouches for specific details. If the number, type, state
  // or expiry changes, that sign-off no longer applies.
  const identityChanged =
    next.type !== existing.type ||
    next.number !== existing.number ||
    next.state !== existing.state ||
    (next.expiryDate?.getTime() ?? null) !== (existing.expiryDate?.getTime() ?? null);

  await prisma.licence.update({
    where: { id: existing.id },
    data: {
      ...next,
      ...(identityChanged
        ? { verification: "UNVERIFIED", verifiedAt: null, verifiedBy: null, verifyMethod: null, verifyNote: null, lastAlertDays: null }
        : {}),
    },
  });
  if (identityChanged) {
    await logEvent(existing.id, actor, "UPDATED", "Details changed — verification reset");
  }
  if (d.document && (await saveDocument(existing.id, d.document))) {
    await logEvent(existing.id, actor, "DOCUMENT", d.document.name);
  }
  await syncLegacyGuardFields(existing.guardId);

  const full = await prisma.licence.findUniqueOrThrow({ where: { id: existing.id }, include: licenceInclude });
  return NextResponse.json(serialiseLicence(full));
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const existing = await prisma.licence.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!existing) return jsonError("not found", 404);
  await prisma.licence.delete({ where: { id: existing.id } });
  await syncLegacyGuardFields(existing.guardId);
  return NextResponse.json({ ok: true });
}
