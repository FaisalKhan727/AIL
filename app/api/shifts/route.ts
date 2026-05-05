import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { shiftCreateSchema, shiftBatchCreateSchema } from "@/lib/validators";
import { generateConfirmCode } from "@/lib/codes";

async function newConfirmCode(): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const code = generateConfirmCode();
    const exists = await prisma.shift.findUnique({ where: { confirmCode: code } });
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique confirm code");
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("invalid body", 400);

  const isBatch = Array.isArray((body as { guardIds?: unknown }).guardIds);
  const parsed = isBatch
    ? shiftBatchCreateSchema.safeParse(body)
    : shiftCreateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());

  const data = parsed.data;
  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);
  if (endAt <= startAt) return jsonError("end must be after start", 400);

  const roster = await prisma.roster.findFirst({
    where: { id: data.rosterId, companyId: auth.companyId },
  });
  if (!roster) return jsonError("roster not found", 404);

  const siteOk = await prisma.site.findFirst({
    where: { id: data.siteId, companyId: auth.companyId },
  });
  if (!siteOk) return jsonError("site not in this company", 400);

  const guardIds = isBatch
    ? (data as { guardIds: string[] }).guardIds
    : [(data as { guardId: string }).guardId];

  const dedupedGuardIds = Array.from(new Set(guardIds));
  const guards = await prisma.guard.findMany({
    where: { id: { in: dedupedGuardIds }, companyId: auth.companyId },
  });
  if (guards.length !== dedupedGuardIds.length) {
    return jsonError("one or more guards are not in this company", 400);
  }

  const createdShifts: { id: string; guardId: string }[] = [];

  for (const guardId of dedupedGuardIds) {
    const code = await newConfirmCode();
    const shift = await prisma.shift.create({
      data: {
        rosterId: data.rosterId,
        guardId,
        siteId: data.siteId,
        startAt,
        endAt,
        role: data.role,
        notes: data.notes,
        confirmCode: code,
      },
    });
    createdShifts.push({ id: shift.id, guardId });
  }

  return NextResponse.json(
    { count: createdShifts.length, shifts: createdShifts },
    { status: 201 },
  );
}
