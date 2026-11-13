import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireGuard } from "@/lib/api";
import {
  licenceFieldsSchema,
  licenceInclude,
  logEvent,
  parseDateOnly,
  saveDocument,
  serialiseLicence,
  syncLegacyGuardFields,
} from "@/lib/server/licences";

export async function GET() {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const rows = await prisma.licence.findMany({
    where: { guardId: auth.guardId },
    include: licenceInclude,
    orderBy: [{ expiryDate: "asc" }],
  });
  return NextResponse.json(rows.map((l) => serialiseLicence(l)));
}

// A guard submits a new or renewed credential. It always starts unverified
// and lands in the office's verification queue.
export async function POST(req: Request) {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const parsed = licenceFieldsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const d = parsed.data;
  if (!d.document) return jsonError("Add a photo of the licence so the office can verify it.", 400);

  const licence = await prisma.licence.create({
    data: {
      companyId: auth.companyId,
      guardId: auth.guardId,
      type: d.type,
      number: d.number,
      state: d.state,
      issueDate: parseDateOnly(d.issueDate),
      expiryDate: parseDateOnly(d.expiryDate),
      source: "GUARD",
    },
  });
  if (!(await saveDocument(licence.id, d.document))) {
    await prisma.licence.delete({ where: { id: licence.id } });
    return jsonError("That file couldn't be read. Use a JPG, PNG or PDF under 2 MB.", 400);
  }
  await logEvent(licence.id, "Guard", "CREATED", "Uploaded from the guard app");
  await syncLegacyGuardFields(auth.guardId);

  const full = await prisma.licence.findUniqueOrThrow({ where: { id: licence.id }, include: licenceInclude });
  return NextResponse.json(serialiseLicence(full), { status: 201 });
}
