import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

const schema = z.object({ shiftIds: z.array(z.string().min(1)).min(1) });

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const r = await prisma.shift.updateMany({
    where: { id: { in: parsed.data.shiftIds }, status: "CONFIRMED" },
    data: { status: "WORKED" },
  });
  return NextResponse.json({ ok: true, updated: r.count });
}
