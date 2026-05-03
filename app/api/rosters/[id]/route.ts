import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { rosterUpdateSchema } from "@/lib/validators";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const roster = await prisma.roster.findUnique({
    where: { id: params.id },
    include: {
      shifts: {
        orderBy: { startAt: "asc" },
        include: { guard: true, site: true },
      },
    },
  });
  if (!roster) return jsonError("not found", 404);
  return NextResponse.json(roster);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  const parsed = rosterUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const data = parsed.data;
  const roster = await prisma.roster.update({
    where: { id: params.id },
    data: {
      name: data.name,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      status: data.status,
    },
  });
  return NextResponse.json(roster);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  await prisma.roster.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
