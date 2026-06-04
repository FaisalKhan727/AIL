import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { rosterUpdateSchema } from "@/lib/validators";

async function ensureRoster(id: string, companyId: string) {
  return prisma.roster.findFirst({ where: { id, companyId } });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  // Slim select instead of full include — the roster detail page only
  // renders guard name + id and site name + id. Full guard rows include
  // payRate, notes, licenceNumber etc. which were transferred but never
  // rendered. Saves ~300ms wall-clock on a roster with 100+ shifts.
  const roster = await prisma.roster.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      status: true,
      publishedAt: true,
      shifts: {
        orderBy: { startAt: "asc" },
        select: {
          id: true,
          guardId: true,
          siteId: true,
          startAt: true,
          endAt: true,
          role: true,
          notes: true,
          status: true,
          publishedAt: true,
          confirmCode: true,
          confirmedAt: true,
          rejectedAt: true,
          workedStart: true,
          workedEnd: true,
          guard: { select: { id: true, firstName: true, lastName: true } },
          site: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!roster) return jsonError("not found", 404);
  return NextResponse.json(roster);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (!(await ensureRoster(params.id, auth.companyId))) return jsonError("not found", 404);
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
  if (!(await ensureRoster(params.id, auth.companyId))) return jsonError("not found", 404);
  await prisma.roster.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
