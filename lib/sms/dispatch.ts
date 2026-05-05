import { prisma } from "@/lib/prisma";
import { getSmsAdapter } from "./index";
import { buildRosterMessage, type ShiftLineInput } from "./templates";
import { APP_TZ } from "@/lib/date";

interface DispatchResult {
  guardId: string;
  shiftIds: string[];
  to: string;
  status: string;
  ok: boolean;
  error?: string;
}

async function getCompanySetting(companyId: string, key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key } },
  });
  return row?.value;
}

async function ensureRosterPublished(rosterId: string) {
  const r = await prisma.roster.findUnique({ where: { id: rosterId } });
  if (r && r.status !== "PUBLISHED") {
    await prisma.roster.update({
      where: { id: rosterId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
  }
}

interface DispatchOptions {
  /** When true, only send SMS to PENDING shifts that have not been sent yet. */
  onlyUnpublished?: boolean;
}

/**
 * Build & send an SMS to every guard with PENDING shifts in this roster.
 * Each guard gets one message listing all their shifts in the roster.
 *
 * - When `onlyUnpublished` is true, shifts with `publishedAt != null` are
 *   skipped — used by the per-shift "Publish all" flow.
 * - Successfully sent shifts have `publishedAt` set to now() if it was null.
 */
export async function dispatchRosterSms(
  rosterId: string,
  opts: DispatchOptions = {},
): Promise<DispatchResult[]> {
  const adapter = getSmsAdapter();

  const roster = await prisma.roster.findUnique({
    where: { id: rosterId },
    include: { shifts: { include: { guard: true, site: true }, orderBy: { startAt: "asc" } } },
  });
  if (!roster) throw new Error("roster not found");

  const tz = (await getCompanySetting(roster.companyId, "timezone")) ?? APP_TZ;
  const template = await getCompanySetting(roster.companyId, "sms_template_roster");

  const byGuard = new Map<string, typeof roster.shifts>();
  for (const s of roster.shifts) {
    if (s.status !== "PENDING") continue;
    if (opts.onlyUnpublished && s.publishedAt) continue;
    const list = byGuard.get(s.guardId) ?? [];
    list.push(s);
    byGuard.set(s.guardId, list);
  }

  const results: DispatchResult[] = [];

  for (const [guardId, shifts] of byGuard) {
    if (shifts.length === 0) continue;
    const guard = shifts[0].guard;
    if (!guard.active) continue;

    const lines: ShiftLineInput[] = shifts.map((s, idx) => ({
      index: idx + 1,
      startAt: s.startAt,
      endAt: s.endAt,
      siteName: s.site.name,
      role: s.role,
    }));

    const body = buildRosterMessage({
      firstName: guard.firstName,
      rosterName: roster.name,
      shifts: lines,
      firstConfirmCode: shifts[0].confirmCode,
      template,
      timezone: tz,
    });

    try {
      const sendRes = await adapter.sendSms(guard.phone, body, { guardId });
      const now = new Date();
      const unpublishedIds = shifts.filter((s) => !s.publishedAt).map((s) => s.id);
      if (unpublishedIds.length > 0) {
        await prisma.shift.updateMany({
          where: { id: { in: unpublishedIds } },
          data: { publishedAt: now },
        });
      }
      results.push({
        guardId,
        shiftIds: shifts.map((s) => s.id),
        to: guard.phone,
        status: sendRes.status,
        ok: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        guardId,
        shiftIds: shifts.map((s) => s.id),
        to: guard.phone,
        status: "failed",
        ok: false,
        error: message,
      });
    }
  }

  if (results.some((r) => r.ok)) {
    await ensureRosterPublished(rosterId);
  }

  return results;
}

/**
 * Send SMS for a single shift. Used both for first-time publish and for
 * resends — sets `publishedAt` if it was null and promotes the parent roster
 * to PUBLISHED if it was still DRAFT, so inbound replies flow through the
 * webhook.
 */
export async function resendShiftSms(shiftId: string) {
  const adapter = getSmsAdapter();

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { guard: true, site: true, roster: true },
  });
  if (!shift) throw new Error("shift not found");

  const tz = (await getCompanySetting(shift.roster.companyId, "timezone")) ?? APP_TZ;
  const template = await getCompanySetting(shift.roster.companyId, "sms_template_roster");

  const lines: ShiftLineInput[] = [
    { index: 1, startAt: shift.startAt, endAt: shift.endAt, siteName: shift.site.name, role: shift.role },
  ];

  const body = buildRosterMessage({
    firstName: shift.guard.firstName,
    rosterName: shift.roster.name,
    shifts: lines,
    firstConfirmCode: shift.confirmCode,
    template,
    timezone: tz,
  });

  const result = await adapter.sendSms(shift.guard.phone, body, {
    guardId: shift.guardId,
    shiftId: shift.id,
  });

  if (!shift.publishedAt) {
    await prisma.shift.update({ where: { id: shift.id }, data: { publishedAt: new Date() } });
  }
  await ensureRosterPublished(shift.rosterId);

  return result;
}
