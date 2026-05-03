import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api";
import { dispatchRosterSms } from "@/lib/sms/dispatch";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const dispatched = await dispatchRosterSms(params.id);
    return NextResponse.json({ ok: true, sent: dispatched.length, dispatched });
  } catch (e: unknown) {
    return jsonError(e instanceof Error ? e.message : "resend failed", 500);
  }
}
