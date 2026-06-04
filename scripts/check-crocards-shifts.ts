/**
 * Inspect the actual stored startAt/endAt for the CroCards Pty Ltd
 * shifts the user just flagged in the timesheet thread. The PWA display
 * format collapses the end-date into just its time-of-day, so it's
 * impossible to tell from the UI whether endAt was saved on day+1 (and
 * the cross-midnight maths is correct) or on the same calendar day
 * (which would silently floor shiftHours() to 0).
 *
 * Prints raw UTC timestamps, the time delta in hours, and what
 * shiftHours() would return for each.
 */

import { PrismaClient } from "@prisma/client";
import { shiftHours } from "../lib/hours";

async function main() {
  const p = new PrismaClient();
  try {
    const shifts = await p.shift.findMany({
      where: {
        site: { name: { contains: "CroCards", mode: "insensitive" } },
      },
      orderBy: { startAt: "asc" },
      include: {
        guard: { select: { firstName: true, lastName: true, payRate: true } },
        site: { select: { name: true } },
      },
    });

    if (shifts.length === 0) {
      console.log("No shifts found for sites matching 'CroCards'.");
      return;
    }

    console.log(`Found ${shifts.length} shift(s) at CroCards Pty Ltd:\n`);
    for (const s of shifts) {
      const startIso = s.startAt.toISOString();
      const endIso = s.endAt.toISOString();
      const deltaMs = s.endAt.getTime() - s.startAt.getTime();
      const deltaHours = deltaMs / 3600_000;
      const computed = shiftHours({
        status: s.status,
        startAt: s.startAt,
        endAt: s.endAt,
        workedStart: s.workedStart,
        workedEnd: s.workedEnd,
      });
      const rate = s.guard?.payRate ? Number(s.guard.payRate.toString()) : 0;

      console.log(`  ${s.guard?.firstName ?? "?"} ${s.guard?.lastName ?? "?"}   (${s.status})`);
      console.log(`    startAt:     ${startIso}`);
      console.log(`    endAt:       ${endIso}`);
      console.log(`    delta:       ${deltaHours.toFixed(2)} h (raw, ignores status)`);
      console.log(`    shiftHours:  ${computed} h  (what the PWA + admin both use)`);
      console.log(`    pay rate:    $${rate}/h  →  pay: $${(computed * rate).toFixed(2)}`);
      if (s.workedStart || s.workedEnd) {
        console.log(`    workedStart: ${s.workedStart?.toISOString() ?? "—"}`);
        console.log(`    workedEnd:   ${s.workedEnd?.toISOString() ?? "—"}`);
      }
      console.log("");
    }

    // Day-by-day same-day check
    let suspicious = 0;
    for (const s of shifts) {
      if (s.endAt.getTime() <= s.startAt.getTime()) suspicious++;
    }
    if (suspicious > 0) {
      console.log(`\n⚠  ${suspicious} shift(s) have endAt <= startAt — these will report 0 hours.`);
      console.log(`   Likely cause: admin entered both times on the same calendar day in the shift dialog.`);
      console.log(`   Fix: re-edit the shift, set the end date to the NEXT day.`);
    } else {
      console.log("All shifts have endAt > startAt; cross-midnight maths is healthy.");
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
