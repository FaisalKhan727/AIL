import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { dispatchRosterSms } from "@/lib/sms/dispatch";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const owned = await prisma.roster.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!owned) return jsonError("not found", 404);
  try {
    const dispatched = await dispatchRosterSms(params.id);
    const sent = dispatched.filter((d) => d.ok).length;
    const failed = dispatched.filter((d) => !d.ok);
    return NextResponse.json({ ok: true, sent, failedCount: failed.length, failed, dispatched });
  } catch (e: unknown) {
    return jsonError(e instanceof Error ? e.message : "resend failed", 500);
  }
}
