import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import {
  licenceCreateSchema,
  licenceInclude,
  logEvent,
  parseDateOnly,
  saveDocument,
  serialiseLicence,
  syncLegacyGuardFields,
} from "@/lib/server/licences";
import { guardCompliance } from "@/lib/licences";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const [rows, guards] = await Promise.all([
    prisma.licence.findMany({
      where: { companyId: auth.companyId },
      include: licenceInclude,
      orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.guard.findMany({
      where: { companyId: auth.companyId, active: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    }),
  ]);

  const now = new Date();
  const licences = rows.map((l) => serialiseLicence(l, now));
  // Stats describe the working roster, so licences of deactivated guards are
  // listed but not counted.
  const active = licences.filter((l) => l.guardActive);
  const count = (s: string) => active.filter((l) => l.status === s).length;

  const byGuard = new Map<string, typeof rows>();
  for (const l of rows) byGuard.set(l.guardId, [...(byGuard.get(l.guardId) ?? []), l]);
  const guardLevels = guards.map((g) => ({
    id: g.id,
    name: `${g.firstName} ${g.lastName}`,
    ...guardCompliance(byGuard.get(g.id) ?? [], now),
  }));
  const compliant = guardLevels.filter((g) => g.level !== "block").length;

  return NextResponse.json({
    licences,
    guards: guardLevels,
    stats: {
      total: active.length,
      valid: count("VALID"),
      expiring: count("EXPIRING"),
      urgent: count("URGENT"),
      expired: count("EXPIRED"),
      unverified: count("UNVERIFIED"),
      rejected: count("REJECTED"),
      guardsTotal: guards.length,
      guardsCompliant: compliant,
      score: guards.length ? Math.round((compliant / guards.length) * 100) : 100,
    },
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = licenceCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return jsonError(first?.message || "validation", 400, parsed.error.flatten());
  }
  const d = parsed.data;

  const guard = await prisma.guard.findFirst({ where: { id: d.guardId, companyId: auth.companyId } });
  if (!guard) return jsonError("guard not found", 404);

  const licence = await prisma.licence.create({
    data: {
      companyId: auth.companyId,
      guardId: guard.id,
      type: d.type,
      number: d.number,
      state: d.state,
      issueDate: parseDateOnly(d.issueDate),
      expiryDate: parseDateOnly(d.expiryDate),
      source: "ADMIN",
    },
  });
  const actor = auth.session.user.name || "Admin";
  await logEvent(licence.id, actor, "CREATED", "Added by office");
  if (d.document && (await saveDocument(licence.id, d.document))) {
    await logEvent(licence.id, actor, "DOCUMENT", d.document.name);
  }
  await syncLegacyGuardFields(guard.id);

  const full = await prisma.licence.findUniqueOrThrow({ where: { id: licence.id }, include: licenceInclude });
  return NextResponse.json(serialiseLicence(full), { status: 201 });
}
