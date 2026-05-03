import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api";
import { resendShiftSms } from "@/lib/sms/dispatch";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const r = await resendShiftSms(params.id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: unknown) {
    return jsonError(e instanceof Error ? e.message : "resend failed", 500);
  }
}
