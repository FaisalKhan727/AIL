import { NextResponse } from "next/server";
import { toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { shiftCreateSchema, shiftBatchCreateSchema } from "@/lib/validators";
import { generateConfirmCode } from "@/lib/codes";
import { APP_TZ } from "@/lib/date";
import { assertCanDispatchOrError } from "@/lib/dispatch/eligibility";

const DAY_MS = 86_400_000;
const DOW_INDEX: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

async function newConfirmCode(): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const code = generateConfirmCode();
    const exists = await prisma.shift.findUnique({ where: { confirmCode: code } });
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique confirm code");
}

/**
 * Expand a base shift into all calendar occurrences described by a recurrence
 * rule. Duration is preserved from the base shift, so midnight-crossing shifts
 * keep their length (e.g. 19:00 -> 08:00 next day stays 13h on every repeat).
 *
 * Day-of-week comparison is done in the company's timezone so a Tuesday in
 * Melbourne is still Tuesday even when the UTC clock has rolled to Wednesday.
 */
function expandRecurrence(
  baseStart: Date,
  baseEnd: Date,
  daysOfWeek: string[],
  untilDateStr: string,
  tz: string,
): { startAt: Date; endAt: Date }[] {
  const allowed = new Set(
    daysOfWeek
      .map((d) => DOW_INDEX[d.toUpperCase()])
      .filter((n): n is number => n !== undefined),
  );
  if (allowed.size === 0) return [];

  const baseStartLocal = toZonedTime(baseStart, tz);
  const baseStartDate = new Date(
    baseStartLocal.getFullYear(),
    baseStartLocal.getMonth(),
    baseStartLocal.getDate(),
  );
  const [uy, um, ud] = untilDateStr.split("-").map(Number);
  const untilDate = new Date(uy, um - 1, ud);
  if (untilDate.getTime() < baseStartDate.getTime()) return [];

  const duration = baseEnd.getTime() - baseStart.getTime();
  const occurrences: { startAt: Date; endAt: Date }[] = [];

  for (
    let cursor = new Date(baseStartDate);
    cursor.getTime() <= untilDate.getTime();
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const dayOffset = Math.round(
      (cursor.getTime() - baseStartDate.getTime()) / DAY_MS,
    );
    const cursorInTz = toZonedTime(
      new Date(baseStart.getTime() + dayOffset * DAY_MS),
      tz,
    );
    if (!allowed.has(cursorInTz.getDay())) continue;
    occurrences.push({
      startAt: new Date(baseStart.getTime() + dayOffset * DAY_MS),
      endAt: new Date(baseStart.getTime() + dayOffset * DAY_MS + duration),
    });
  }
  return occurrences;
}

async function getCompanyTz(companyId: string): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key: "timezone" } },
  });
  return row?.value || APP_TZ;
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("invalid body", 400);

  const isBatch = Array.isArray((body as { guardIds?: unknown }).guardIds);
  const parsed = isBatch
    ? shiftBatchCreateSchema.safeParse(body)
    : shiftCreateSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());

  const data = parsed.data;
  const baseStart = new Date(data.startAt);
  const baseEnd = new Date(data.endAt);
  if (baseEnd <= baseStart) return jsonError("end must be after start", 400);

  const roster = await prisma.roster.findFirst({
    where: { id: data.rosterId, companyId: auth.companyId },
  });
  if (!roster) return jsonError("roster not found", 404);

  const siteOk = await prisma.site.findFirst({
    where: { id: data.siteId, companyId: auth.companyId },
  });
  if (!siteOk) return jsonError("site not in this company", 400);

  const guardIds = isBatch
    ? (data as { guardIds: string[] }).guardIds
    : [(data as { guardId: string }).guardId];

  const dedupedGuardIds = Array.from(new Set(guardIds));
  const guards = await prisma.guard.findMany({
    where: { id: { in: dedupedGuardIds }, companyId: auth.companyId },
  });
  if (guards.length !== dedupedGuardIds.length) {
    return jsonError("one or more guards are not in this company", 400);
  }

  const blocked = await assertCanDispatchOrError(dedupedGuardIds, auth.companyId);
  if (blocked) return blocked;

  const recurrence = !isBatch ? (data as { recurrence?: { daysOfWeek: string[]; untilDate: string } }).recurrence : undefined;
  let occurrences: { startAt: Date; endAt: Date }[] = [{ startAt: baseStart, endAt: baseEnd }];
  if (recurrence) {
    const tz = await getCompanyTz(auth.companyId);
    occurrences = expandRecurrence(
      baseStart,
      baseEnd,
      recurrence.daysOfWeek,
      recurrence.untilDate,
      tz,
    );
    if (occurrences.length === 0) {
      return jsonError("recurrence produced zero occurrences (check days and until date)", 400);
    }
  }

  const createdShifts: { id: string; guardId: string; startAt: Date; endAt: Date }[] = [];

  for (const guardId of dedupedGuardIds) {
    for (const occ of occurrences) {
      const code = await newConfirmCode();
      const shift = await prisma.shift.create({
        data: {
          rosterId: data.rosterId,
          guardId,
          siteId: data.siteId,
          startAt: occ.startAt,
          endAt: occ.endAt,
          role: data.role,
          notes: data.notes,
          confirmCode: code,
        },
      });
      createdShifts.push({ id: shift.id, guardId, startAt: shift.startAt, endAt: shift.endAt });
    }
  }

  return NextResponse.json(
    { count: createdShifts.length, shifts: createdShifts },
    { status: 201 },
  );
}
