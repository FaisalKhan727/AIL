import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { planCopy, calendarDayDiff } from "@/lib/copy-roster";
import { generateConfirmCode } from "@/lib/codes";
import { APP_TZ } from "@/lib/date";
import { assertCanDispatchOrError } from "@/lib/dispatch/eligibility";

const schema = z.object({
  sourceRosterId: z.string().min(1),
  newName: z.string().trim().min(1).max(120),
  newStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  options: z.object({
    keepGuards: z.boolean(),
    keepNotes: z.boolean(),
    skipInactiveGuards: z.boolean(),
    skipInactiveSites: z.boolean(),
  }),
});

/**
 * Create a draft roster by copying shifts from a source roster.
 *
 * Re-runs the planner server-side against fresh guard/site data — the
 * client's preview is advisory; what actually gets created is whatever the
 * server's plan says, so the operator can't accidentally create shifts for
 * guards who were deactivated between preview and confirm.
 *
 * The new roster is always DRAFT. Publishing remains an explicit step done
 * via the existing /api/rosters/[id]/publish route — this endpoint never
 * sends SMS.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const { sourceRosterId, newName, newStartDate, options } = parsed.data;

  const source = await prisma.roster.findFirst({
    where: { id: sourceRosterId, companyId: auth.companyId },
    include: { shifts: true },
  });
  if (!source) return jsonError("source roster not found", 404);
  if (source.shifts.length === 0) {
    return jsonError("source roster has no shifts to copy", 400);
  }

  const tzRow = await prisma.setting.findUnique({
    where: { companyId_key: { companyId: auth.companyId, key: "timezone" } },
  });
  const tz = tzRow?.value || APP_TZ;

  const [y, m, d] = newStartDate.split("-").map(Number);
  const newStartLocal = new Date(y, m - 1, d, 0, 0, 0, 0);
  const daysOffset = calendarDayDiff(source.startDate, newStartLocal, tz);

  const [guards, sites] = await Promise.all([
    prisma.guard.findMany({ where: { companyId: auth.companyId } }),
    prisma.site.findMany({ where: { companyId: auth.companyId } }),
  ]);

  const guardMap = new Map(
    guards.map((g) => [g.id, { id: g.id, active: g.active, licenceExpiry: g.licenceExpiry }]),
  );
  const siteMap = new Map(sites.map((s) => [s.id, { id: s.id, active: s.active }]));

  const plan = planCopy({
    shifts: source.shifts.map((s) => ({
      id: s.id,
      guardId: s.guardId,
      siteId: s.siteId,
      templateId: s.templateId,
      startAt: s.startAt,
      endAt: s.endAt,
      role: s.role,
      notes: s.notes,
    })),
    guards: guardMap,
    sites: siteMap,
    daysOffset,
    timezone: tz,
    options,
  });

  if (plan.plannedCount === 0) {
    return jsonError(
      "nothing to create — every source shift was skipped (try toggling 'skip inactive ...' off)",
      400,
      { plan: { planned: plan.planned, skipped: plan.skipped } },
    );
  }

  // Block the copy if any planned shift would land on a guard whose
  // onboarding isn't complete (and who doesn't have an active dispatch
  // override). Failing here protects against the operational sin of
  // bulk-cloning shifts into the future for someone who shouldn't be
  // dispatched yet.
  const plannedGuardIds = Array.from(
    new Set(plan.planned.map((p) => p.guardId).filter((id): id is string => !!id)),
  );
  if (plannedGuardIds.length > 0) {
    const blocked = await assertCanDispatchOrError(plannedGuardIds, auth.companyId);
    if (blocked) return blocked;
  }

  // Pre-generate a unique batch of confirm codes so the create can be done
  // in a single createMany. Collisions are checked against existing rows
  // up-front; the @unique constraint catches any race in the rare case.
  const codes = new Set<string>();
  while (codes.size < plan.plannedCount) {
    codes.add(generateConfirmCode());
  }
  const codeArr = Array.from(codes);
  const existing = await prisma.shift.findMany({
    where: { confirmCode: { in: codeArr } },
    select: { confirmCode: true },
  });
  if (existing.length > 0) {
    return jsonError("confirm code collision — please retry", 503);
  }

  const newEndAt = new Date(Math.max(...plan.planned.map((p) => p.endAt.getTime())));

  const result = await prisma.$transaction(async (tx) => {
    const roster = await tx.roster.create({
      data: {
        name: newName,
        startDate: newStartLocal,
        endDate: newEndAt,
        status: "DRAFT", // never auto-publish; SMS only fires on explicit publish
        companyId: auth.companyId,
      },
    });

    await tx.shift.createMany({
      data: plan.planned.map((p, i) => ({
        rosterId: roster.id,
        guardId: p.guardId,
        siteId: p.siteId,
        templateId: p.templateId,
        startAt: p.startAt,
        endAt: p.endAt,
        role: p.role,
        notes: p.notes,
        confirmCode: codeArr[i],
        status: "PENDING",
      })),
    });

    return roster;
  }, { timeout: 30000 });

  return NextResponse.json(
    {
      rosterId: result.id,
      plan: {
        plannedCount: plan.plannedCount,
        skippedCount: plan.skippedCount,
        unassignedCount: plan.unassignedCount,
      },
    },
    { status: 201 },
  );
}
