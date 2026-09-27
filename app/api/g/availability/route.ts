import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireGuard, assertGuardOwnsCompany } from "@/lib/guard-auth";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const bodySchema = z.object({
  companyId: z.string().min(1),
  daysOfWeek: z.array(z.enum(DAYS as [string, ...string[]])),
  notes: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});

/**
 * GET/PUT /api/g/availability?companyId=X
 *
 * A guard's own general weekly availability for one company employment
 * (a guard can have different availability per employer). Admin sees this
 * read-only on the guard profile; only the guard edits it.
 */
export async function GET(req: Request) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const companyId = new URL(req.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  const forbidden = assertGuardOwnsCompany(guard, companyId);
  if (forbidden) return forbidden;

  const membership = guard.memberships.find((m) => m.companyId === companyId)!;
  const row = await prisma.guardAvailability.findUnique({ where: { guardId: membership.guardId } });

  return NextResponse.json({
    daysOfWeek: row?.daysOfWeek ? row.daysOfWeek.split(",").filter(Boolean) : [],
    notes: row?.notes ?? "",
    updatedAt: row?.updatedAt ?? null,
  });
}

export async function PUT(req: Request) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });

  const forbidden = assertGuardOwnsCompany(guard, parsed.data.companyId);
  if (forbidden) return forbidden;

  const membership = guard.memberships.find((m) => m.companyId === parsed.data.companyId)!;
  const daysOfWeek = Array.from(new Set(parsed.data.daysOfWeek)).join(",");

  const row = await prisma.guardAvailability.upsert({
    where: { guardId: membership.guardId },
    create: { guardId: membership.guardId, daysOfWeek, notes: parsed.data.notes ?? null },
    update: { daysOfWeek, notes: parsed.data.notes ?? null },
  });

  return NextResponse.json({
    daysOfWeek: row.daysOfWeek.split(",").filter(Boolean),
    notes: row.notes ?? "",
    updatedAt: row.updatedAt,
  });
}
