/**
 * Find shifts with a worked window shorter than 15 minutes (likely
 * accidental clock-in / clock-out double-tap) and clear the worked
 * timestamps so timesheet hours fall back to the scheduled values.
 *
 * Default mode is DRY RUN — prints what WOULD be cleared without
 * modifying the database. Pass --apply to actually clear them.
 *
 * Usage:
 *   npx tsx scripts/clean-misclock-shifts.ts            # dry run
 *   npx tsx scripts/clean-misclock-shifts.ts --apply    # WRITES
 */

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const MIN_WORKED_MS = 15 * 60 * 1000;

async function main() {
  const p = new PrismaClient();
  try {
    const rows = await p.shift.findMany({
      where: {
        workedStart: { not: null },
        workedEnd: { not: null },
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        workedStart: true,
        workedEnd: true,
        status: true,
        guard: { select: { firstName: true, lastName: true } },
        site: { select: { name: true } },
      },
    });

    const suspicious = rows.filter((s) => {
      const ws = s.workedStart!.getTime();
      const we = s.workedEnd!.getTime();
      return we - ws < MIN_WORKED_MS;
    });

    console.log("");
    console.log(`=== Shifts with worked window < 15 min ===`);
    console.log(`mode:        ${APPLY ? "APPLY (will clear worked times)" : "DRY RUN (read-only)"}`);
    console.log(`scanned:     ${rows.length} shifts with worked times`);
    console.log(`suspicious:  ${suspicious.length}`);
    console.log("");

    if (suspicious.length === 0) {
      console.log("Nothing to clean. ✓");
      return;
    }

    for (const s of suspicious) {
      const sec = Math.round((s.workedEnd!.getTime() - s.workedStart!.getTime()) / 1000);
      console.log(`  ${s.id}  ${s.guard?.firstName ?? "?"} ${s.guard?.lastName ?? "?"}  @ ${s.site?.name ?? "?"}`);
      console.log(`    status=${s.status}  worked window=${sec}s`);
      console.log(`    workedStart=${s.workedStart!.toISOString()}  workedEnd=${s.workedEnd!.toISOString()}`);
      console.log(`    scheduled=${s.startAt.toISOString()} → ${s.endAt.toISOString()}`);
      console.log("");
    }

    if (!APPLY) {
      console.log("Dry run complete. Re-run with --apply to clear the worked times on the rows above.");
      return;
    }

    // Apply: null out the worked timestamps. Keep status as-is (admin may
    // have set WORKED deliberately) so the scheduled-time fallback in
    // shiftHours kicks in. ClockEvent audit rows are untouched.
    const ids = suspicious.map((s) => s.id);
    const result = await p.shift.updateMany({
      where: { id: { in: ids } },
      data: { workedStart: null, workedEnd: null },
    });
    console.log(`\nCleared worked times on ${result.count} shifts.`);
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
