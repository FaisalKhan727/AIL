import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { shiftCreateSchema } from "@/lib/validators";
import { generateConfirmCode } from "@/lib/codes";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  const parsed = shiftCreateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const data = parsed.data;
  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);
  if (endAt <= startAt) return jsonError("end must be after start", 400);

  // Generate unique confirm code
  let code = "";
  for (let i = 0; i < 25; i++) {
    code = generateConfirmCode();
    const exists = await prisma.shift.findUnique({ where: { confirmCode: code } });
    if (!exists) break;
  }

  const shift = await prisma.shift.create({
    data: {
      rosterId: data.rosterId,
      guardId: data.guardId,
      siteId: data.siteId,
      startAt,
      endAt,
      role: data.role,
      notes: data.notes,
      confirmCode: code,
    },
  });
  return NextResponse.json(shift, { status: 201 });
}
