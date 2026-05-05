import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { siteCreateSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase();
  const sites = await prisma.site.findMany({
    where: {
      companyId: auth.companyId,
      ...(q ? { OR: [{ name: { contains: q } }, { address: { contains: q } }] } : {}),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(sites);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  const parsed = siteCreateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const site = await prisma.site.create({ data: { ...parsed.data, companyId: auth.companyId } });
  return NextResponse.json(site, { status: 201 });
}
