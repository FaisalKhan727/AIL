import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { resendShiftSms } from "@/lib/sms/dispatch";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const owned = await prisma.shift.findFirst({
    where: { id: params.id, roster: { companyId: auth.companyId } },
  });
  if (!owned) return jsonError("not found", 404);
  try {
    const r = await resendShiftSms(params.id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: unknown) {
    return jsonError(e instanceof Error ? e.message : "resend failed", 500);
  }
}
