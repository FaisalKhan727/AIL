import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { guardCreateSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase();
  const activeFilter = searchParams.get("active");

  const guards = await prisma.guard.findMany({
    where: {
      companyId: auth.companyId,
      ...(activeFilter === "true" ? { active: true } : activeFilter === "false" ? { active: false } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q } },
              { licenceNumber: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ active: "desc" }, { lastName: "asc" }],
  });
  return NextResponse.json(guards);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  const parsed = guardCreateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const data = parsed.data;
  try {
    const guard = await prisma.guard.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        licenceNumber: data.licenceNumber,
        licenceExpiry: data.licenceExpiry ? new Date(data.licenceExpiry) : null,
        payRate: data.payRate?.toString(),
        notes: data.notes,
        active: data.active ?? true,
        companyId: auth.companyId,
      },
    });
    return NextResponse.json(guard, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "create failed";
    if (msg.includes("Unique")) return jsonError("phone already exists", 409);
    return jsonError(msg, 500);
  }
}
