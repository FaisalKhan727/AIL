import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { INCIDENT_STATUSES } from "@/lib/ops";
import { actorName } from "@/lib/server/crud";

const schema = z.object({
  status: z.enum(INCIDENT_STATUSES).optional(),
  assignedTo: z.string().trim().max(80).nullable().optional(),
  notifyClient: z.boolean().optional(),
  update: z.string().trim().min(1).max(2000).optional(),
});

// Every change to an incident is also written to its timeline.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const d = parsed.data;
  const inc = await prisma.incident.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!inc) return jsonError("not found", 404);

  const actor = actorName(auth);
  const notes: string[] = [];
  if (d.status && d.status !== inc.status) notes.push(`Status: ${inc.status.replace("_", " ")} → ${d.status.replace("_", " ")}`);
  if (d.assignedTo !== undefined && (d.assignedTo || null) !== inc.assignedTo) notes.push(d.assignedTo ? `Assigned to ${d.assignedTo}` : "Unassigned");
  if (d.notifyClient !== undefined && d.notifyClient !== inc.notifyClient) notes.push(d.notifyClient ? "Flagged to notify client" : "Client notification flag removed");
  if (d.update) notes.push(d.update);

  await prisma.incident.update({
    where: { id: inc.id },
    data: {
      status: d.status,
      assignedTo: d.assignedTo === undefined ? undefined : d.assignedTo || null,
      notifyClient: d.notifyClient,
      updates: notes.length ? { create: notes.map((text) => ({ actor, text })) } : undefined,
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (auth.role !== "OWNER") return jsonError("Only an owner can delete an incident. Archive it instead.", 403);
  const inc = await prisma.incident.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!inc) return jsonError("not found", 404);
  await prisma.incident.delete({ where: { id: inc.id } });
  return NextResponse.json({ ok: true });
}
