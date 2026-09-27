import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { getSmsAdapter } from "@/lib/sms";

const bodySchema = z.object({
  guardId: z.string().min(1),
  message: z.string().trim().min(1).max(1600),
});

/**
 * POST /api/sms/send
 *
 * Ad-hoc, free-text SMS to one guard — for the "Send SMS" dashboard quick
 * action and the SMS Centre compose button. Separate from roster dispatch
 * (lib/sms/dispatch.ts), which sends shift-confirmation messages built from
 * templates; this always goes out over SMS (no push fallback) since it's
 * not tied to a shift the guard app can render.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());

  const guard = await prisma.guard.findFirst({
    where: { id: parsed.data.guardId, companyId: auth.companyId },
  });
  if (!guard) return jsonError("guard not found", 404);
  if (!guard.active) return jsonError("guard is inactive", 400);

  try {
    const result = await getSmsAdapter().sendSms(guard.phone, parsed.data.message, {
      guardId: guard.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "send failed", 502);
  }
}
