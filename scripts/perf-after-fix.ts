/**
 * Compare the new (slim select + fire-and-forget touch) requireGuard
 * pattern against the old (deep includes + awaited transaction touch)
 * against the same prod DB, back-to-back.
 *
 * Runs each path twice and reports the second-run timing (first runs
 * pay for cold pool wake-up; we want the realistic warm number).
 */

import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  try {
    const anySession = await p.guardSession.findFirst({
      select: { tokenHash: true },
    });
    if (!anySession) throw new Error("no GuardSession to test against");
    const tokenHash = anySession.tokenHash;

    await p.$queryRaw`SELECT 1`; // warm pool

    for (let run = 1; run <= 2; run++) {
      console.log(`\n--- Run ${run} ---`);

      // OLD pattern: include nested + awaited transaction touch
      let t = performance.now();
      const sessionOld = await p.guardSession.findUnique({
        where: { tokenHash },
        include: {
          guardAccount: {
            include: {
              guardIdentity: {
                include: {
                  employments: {
                    where: { active: true },
                    include: { company: { select: { name: true, brandColour: true } } },
                  },
                },
              },
            },
          },
        },
      });
      const readOld = performance.now() - t;
      console.log(`  OLD read (include):           ${readOld.toFixed(0)} ms`);

      if (sessionOld) {
        t = performance.now();
        await p.$transaction([
          p.guardSession.update({
            where: { id: sessionOld.id },
            data: { lastUsedAt: new Date() },
          }),
          p.guardAccount.update({
            where: { id: sessionOld.guardAccountId },
            data: { lastSeenAt: new Date() },
          }),
        ]);
        const touchOld = performance.now() - t;
        console.log(`  OLD awaited touch transaction: ${touchOld.toFixed(0)} ms`);
        console.log(`  OLD total (read + touch):     ${(readOld + touchOld).toFixed(0)} ms`);
      }

      // NEW pattern: slim select + skip touch (within 60s throttle)
      t = performance.now();
      const sessionNew = await p.guardSession.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          expiresAt: true,
          revokedAt: true,
          lastUsedAt: true,
          guardAccountId: true,
          guardAccount: {
            select: {
              id: true,
              suspendedAt: true,
              guardIdentity: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  employments: {
                    where: { active: true },
                    select: {
                      id: true,
                      companyId: true,
                      company: { select: { name: true, brandColour: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const readNew = performance.now() - t;
      console.log(`  NEW read (select):            ${readNew.toFixed(0)} ms`);
      console.log(`  NEW total (touch throttled or fire-and-forget): ${readNew.toFixed(0)} ms`);
      console.log(`  Found: ${sessionNew ? "yes" : "no"}`);
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
