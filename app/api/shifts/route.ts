import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { shiftCreateSchema } from "@/lib/validators";
import { generateConfirmCode } from "@/lib/codes";
import { resendShiftSms } from "@/lib/sms/dispatch";

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

  const roster = await prisma.roster.findUnique({ where: { id: data.rosterId } });
  if (!roster) return jsonError("roster not found", 404);

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

  let sms: { sent: boolean; status?: string; error?: string } = { sent: false };
  if (roster.status === "PUBLISHED") {
    try {
      const r = await resendShiftSms(shift.id);
      sms = { sent: true, status: r.status };
    } catch (e: unknown) {
      sms = { sent: false, error: e instanceof Error ? e.message : "send failed" };
    }
  }

  return NextResponse.json({ ...shift, sms }, { status: 201 });
}
