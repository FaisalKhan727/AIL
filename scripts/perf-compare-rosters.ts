import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  try {
    const c = await p.company.findFirst({ select: { id: true } });
    if (!c) throw new Error("no company");
    await p.$queryRaw`SELECT 1`; // warm pool

    // Run each path twice and take the second time (avoid first-call jitter)
    for (let run = 1; run <= 2; run++) {
      console.log(`--- Run ${run} ---`);

      // OLD path: N+1 (per-roster groupBy)
      let t = performance.now();
      const rOld = await p.roster.findMany({
        where: { companyId: c.id },
        orderBy: { startDate: "desc" },
      });
      await Promise.all(
        rOld.map((r) =>
          p.shift.groupBy({
            by: ["status"],
            where: { rosterId: r.id },
            _count: { _all: true },
          }),
        ),
      );
      const oldMs = performance.now() - t;
      console.log(`  OLD (N+1, ${rOld.length} rosters): ${oldMs.toFixed(0)} ms`);

      // NEW path: one combined groupBy
      t = performance.now();
      const rNew = await p.roster.findMany({
        where: { companyId: c.id },
        orderBy: { startDate: "desc" },
      });
      if (rNew.length > 0) {
        await p.shift.groupBy({
          by: ["rosterId", "status"],
          where: { rosterId: { in: rNew.map((r) => r.id) } },
          _count: { _all: true },
        });
      }
      const newMs = performance.now() - t;
      console.log(`  NEW (combined):                    ${newMs.toFixed(0)} ms`);
      console.log(`  Speedup:                           ${(oldMs / newMs).toFixed(2)}x`);
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
