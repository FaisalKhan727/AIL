/**
 * Company-wide sweep for shifts whose SCHEDULED duration (endAt - startAt)
 * looks implausible — either far too long (an End date that's a day later
 * than intended, e.g. the "Elsternwick Park VAFA" incident: 11:00-17:00
 * shown in the PWA/admin, actually stored as 11:00 Fri -> 17:00 Sat, 30h
 * instead of 6h) or suspiciously short/zero (End left on the same day for
 * a shift that should cross midnight — see check-crocards-shifts.ts for
 * that direction).
 *
 * This only looks at CONFIRMED/PENDING/WORKED shifts (the statuses that
 * feed the timesheet) and is read-only — it never writes to the database.
 * Because the *correct* end date can't be inferred automatically without
 * risking making a real 20h static-guard shift wrong, this script only
 * reports; fixing a flagged shift means re-editing it in the roster UI
 * (Edit shift -> correct the End date) — the shift dialog now also shows a
 * live "Duration: Xh" warning so this shouldn't recur.
 *
 * Usage:
 *   npx tsx scripts/check-suspicious-duration-shifts.ts
 *   npx tsx scripts/check-suspicious-duration-shifts.ts --max-hours=20
 */

import { PrismaClient } from "@prisma/client";
import { shiftHours } from "../lib/hours";

const maxArg = process.argv.find((a) => a.startsWith("--max-hours="));
const MAX_PLAUSIBLE_HOURS = maxArg ? Number(maxArg.split("=")[1]) : 16;
const MIN_PLAUSIBLE_HOURS = 0.25; // 15 minutes

async function main() {
  const p = new PrismaClient();
  try {
    const shifts = await p.shift.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED", "WORKED"] } },
      orderBy: { startAt: "desc" },
      include: {
        guard: { select: { firstName: true, lastName: true } },
        site: { select: { name: true } },
        roster: { select: { name: true, companyId: true } },
      },
    });

    const flagged = shifts.filter((s) => {
      const scheduledHours = (s.endAt.getTime() - s.startAt.getTime()) / 3_600_000;
      return scheduledHours <= 0 || scheduledHours > MAX_PLAUSIBLE_HOURS || (scheduledHours > 0 && scheduledHours < MIN_PLAUSIBLE_HOURS);
    });

    console.log("");
    console.log(`=== Shifts with an implausible scheduled duration ===`);
    console.log(`scanned:    ${shifts.length} PENDING/CONFIRMED/WORKED shifts`);
    console.log(`threshold:  <=0h, <${MIN_PLAUSIBLE_HOURS}h, or >${MAX_PLAUSIBLE_HOURS}h`);
    console.log(`flagged:    ${flagged.length}`);
    console.log("");

    if (flagged.length === 0) {
      console.log("Nothing suspicious found. ✓");
      return;
    }

    for (const s of flagged) {
      const scheduledHours = (s.endAt.getTime() - s.startAt.getTime()) / 3_600_000;
      const computed = shiftHours({
        status: s.status,
        startAt: s.startAt,
        endAt: s.endAt,
        workedStart: s.workedStart,
        workedEnd: s.workedEnd,
      });
      console.log(`  ${s.id}`);
      console.log(`    guard:       ${s.guard?.firstName ?? "?"} ${s.guard?.lastName ?? "unassigned"}`);
      console.log(`    site:        ${s.site?.name ?? "?"}`);
      console.log(`    roster:      ${s.roster?.name ?? "?"} (company ${s.roster?.companyId ?? "?"})`);
      console.log(`    status:      ${s.status}`);
      console.log(`    startAt:     ${s.startAt.toISOString()}`);
      console.log(`    endAt:       ${s.endAt.toISOString()}`);
      console.log(`    scheduled:   ${scheduledHours.toFixed(2)}h`);
      console.log(`    shiftHours:  ${computed}h  (what the timesheet actually shows)`);
      if (s.workedStart || s.workedEnd) {
        console.log(`    workedStart: ${s.workedStart?.toISOString() ?? "—"}`);
        console.log(`    workedEnd:   ${s.workedEnd?.toISOString() ?? "—"}`);
      }
      console.log("");
    }

    console.log("Read-only report — nothing was changed.");
    console.log("To fix: open each shift in the roster (Edit shift) and correct the End date/time.");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
