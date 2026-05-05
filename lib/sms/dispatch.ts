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

async function getSetting(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value;
}

/**
 * Build & send an SMS to every guard with PENDING shifts in this roster.
 * Each guard gets one message listing all their shifts in the roster.
 */
export async function dispatchRosterSms(rosterId: string): Promise<DispatchResult[]> {
  const adapter = getSmsAdapter();
  const tz = (await getSetting("timezone")) ?? APP_TZ;
  const template = await getSetting("sms_template_roster");

  const roster = await prisma.roster.findUnique({
    where: { id: rosterId },
    include: { shifts: { include: { guard: true, site: true }, orderBy: { startAt: "asc" } } },
  });
  if (!roster) throw new Error("roster not found");

  const byGuard = new Map<string, typeof roster.shifts>();
  for (const s of roster.shifts) {
    if (s.status !== "PENDING") continue;
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

  return results;
}

/** Re-send SMS for a single shift (or to a guard for a specific shift). */
export async function resendShiftSms(shiftId: string) {
  const adapter = getSmsAdapter();
  const tz = (await getSetting("timezone")) ?? APP_TZ;
  const template = await getSetting("sms_template_roster");

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { guard: true, site: true, roster: true },
  });
  if (!shift) throw new Error("shift not found");

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

  return adapter.sendSms(shift.guard.phone, body, { guardId: shift.guardId, shiftId: shift.id });
}
