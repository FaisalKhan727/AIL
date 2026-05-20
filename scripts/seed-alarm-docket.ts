/**
 * scripts/seed-alarm-docket.ts
 *
 * Seeds the per-company alarm docket counter. Idempotent — re-running
 * will NOT reset an already-set value, only set it for companies that
 * don't yet have the setting.
 *
 * Auswide + ACS both start at 59005 per spec; dockets are unique-per-
 * company so they never collide.
 */

import { PrismaClient } from "@prisma/client";

const STARTING_DOCKET = "59005";

async function main() {
  const p = new PrismaClient();
  try {
    const companies = await p.company.findMany({ select: { id: true, name: true } });
    if (companies.length === 0) {
      console.error("No companies found.");
      process.exit(1);
    }
    for (const c of companies) {
      const existing = await p.setting.findUnique({
        where: { companyId_key: { companyId: c.id, key: "alarm.nextDocket" } },
      });
      if (existing) {
        console.log(`  ${c.name}: alarm.nextDocket already set to "${existing.value}" — skipped.`);
        continue;
      }
      await p.setting.create({
        data: {
          companyId: c.id,
          key: "alarm.nextDocket",
          value: STARTING_DOCKET,
        },
      });
      console.log(`  ${c.name}: alarm.nextDocket set to "${STARTING_DOCKET}".`);
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
