import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireGuard, assertGuardOwnsCompany } from "@/lib/guard-auth";

/**
 * POST /api/g/sop/acknowledge
 *
 * Body: { companyId, sopVersionId }
 *
 * Writes a SopAcknowledgement row with source=REACKNOWLEDGEMENT. The
 * (guardId, sopVersionId, source) unique constraint makes this safely
 * idempotent — re-posting (e.g. double-tap on the banner) returns 200
 * without writing a duplicate row.
 *
 * Validates: signed in, guard is a member of the named company, and
 * the SopVersion belongs to that company and is the current one.
 */
const bodySchema = z.object({
  companyId: z.string().min(1),
  sopVersionId: z.string().min(1),
});

export async function POST(req: Request) {
  const ctx = await requireGuard();
  if (!ctx.ok) return ctx.response;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId, sopVersionId } = parsed.data;

  const forbidden = assertGuardOwnsCompany(ctx.guard, companyId);
  if (forbidden) return forbidden;

  const membership = ctx.guard.memberships.find((m) => m.companyId === companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden: no membership" }, { status: 403 });
  }

  // SopVersion sanity: must belong to the company and still be current.
  // Acking a stale version after a fresh publish would mark the guard
  // ack'd against the wrong row — refuse and force a re-fetch.
  const sop = await prisma.sopVersion.findUnique({
    where: { id: sopVersionId },
    select: { companyId: true, isCurrent: true, version: true },
  });
  if (!sop || sop.companyId !== companyId) {
    return NextResponse.json({ error: "SOP version not found for this company" }, { status: 404 });
  }
  if (!sop.isCurrent) {
    return NextResponse.json(
      { error: "This SOP version is no longer current — please refresh." },
      { status: 409 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  await prisma.sopAcknowledgement.upsert({
    where: {
      guardId_sopVersionId_source: {
        guardId: membership.guardId,
        sopVersionId,
        source: "REACKNOWLEDGEMENT",
      },
    },
    create: {
      companyId,
      guardId: membership.guardId,
      sopVersionId,
      source: "REACKNOWLEDGEMENT",
      ipAddress: ip,
      userAgent: ua,
    },
    update: {
      acknowledgedAt: new Date(),
      ipAddress: ip,
      userAgent: ua,
    },
  });

  return NextResponse.json({ ok: true });
}
