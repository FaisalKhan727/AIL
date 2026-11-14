import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireGuard } from "@/lib/api";
import { INCIDENT_TYPES, PRIORITIES } from "@/lib/ops";
import { nextRef } from "@/lib/server/crud";
import { decodeDataUrl, documentSchema } from "@/lib/server/licences";

const schema = z.object({
  siteId: z.string().min(1),
  type: z.enum(INCIDENT_TYPES),
  severity: z.enum(PRIORITIES),
  zone: z.string().trim().max(80).optional(),
  narrative: z.string().trim().min(10, "Describe what happened (at least a sentence)").max(5000),
  persons: z.string().trim().max(1000).optional(),
  photo: documentSchema.optional(),
});

// A guard files an incident report from the field.
export async function POST(req: Request) {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const d = parsed.data;
  const [site, guard] = await Promise.all([
    prisma.site.findFirst({ where: { id: d.siteId, companyId: auth.companyId } }),
    prisma.guard.findUniqueOrThrow({ where: { id: auth.guardId } }),
  ]);
  if (!site) return jsonError("site not found", 404);
  const photo = d.photo ? decodeDataUrl(d.photo.dataUrl) : null;
  if (d.photo && (!photo || !photo.mime.startsWith("image/"))) return jsonError("That photo couldn't be read.", 400);

  const incident = await prisma.incident.create({
    data: {
      companyId: auth.companyId,
      ref: await nextRef("incident", auth.companyId),
      siteId: site.id,
      guardId: auth.guardId,
      type: d.type,
      severity: d.severity,
      zone: d.zone || null,
      narrative: d.narrative,
      persons: d.persons || null,
      updates: { create: { actor: `${guard.firstName} ${guard.lastName}`, text: "Reported from the guard app" } },
      ...(photo ? { photo: { create: { mime: photo.mime, data: photo.data } } } : {}),
    },
  });
  return NextResponse.json({ id: incident.id, ref: incident.ref }, { status: 201 });
}
