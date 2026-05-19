/**
 * scripts/perf-time-queries.ts
 *
 * Time the exact Prisma queries that each major API route runs, against
 * the production Neon DB. Reports wall-clock ms per query. Read-only.
 *
 * Run 3 times and take the median to dampen network jitter and Neon
 * pooler warm-up.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;
  // Note count for findMany-shaped results
  let count = "";
  if (Array.isArray(result)) count = ` (${result.length} rows)`;
  console.log(`  ${ms.toFixed(0).padStart(5)}ms  ${label}${count}`);
  return result;
}

async function main() {
  // Pick a company (use the first one)
  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) throw new Error("no company");
  console.log(`Targeting company: ${company.name}\n`);

  // Warm the connection once
  await prisma.$queryRaw`SELECT 1`;

  console.log("=== /api/rosters GET ===");
  const rosters = await time("rosters.findMany (with _count)", () =>
    prisma.roster.findMany({
      where: { companyId: company.id },
      orderBy: { startDate: "desc" },
      include: { _count: { select: { shifts: true } } },
    }),
  );
  // Simulate the N+1 groupBy loop currently in production
  await time(`groupBy loop for ${rosters.length} rosters (N+1)`, async () => {
    return Promise.all(
      rosters.map((r) =>
        prisma.shift.groupBy({
          by: ["status"],
          where: { rosterId: r.id },
          _count: { _all: true },
        }),
      ),
    );
  });

  console.log("\n=== /api/rosters/[id] GET (single roster detail) ===");
  if (rosters[0]) {
    await time("findFirst roster + shifts + guard + site joins", () =>
      prisma.roster.findFirst({
        where: { id: rosters[0].id, companyId: company.id },
        include: {
          shifts: {
            include: { guard: true, site: true },
            orderBy: { startAt: "asc" },
          },
        },
      }),
    );
  }

  console.log("\n=== /api/sms-log GET (last 500) ===");
  await time("smsLog.findMany order receivedAt desc, take 500, include guard", () =>
    prisma.smsLog.findMany({
      where: { guard: { companyId: company.id } },
      include: { guard: true },
      orderBy: { receivedAt: "desc" },
      take: 500,
    }),
  );

  console.log("\n=== /api/dashboard GET (6 parallel queries) ===");
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000);

  await time("dashboard parallel block", () =>
    Promise.all([
      prisma.guard.count({ where: { companyId: company.id, active: true } }),
      prisma.site.count({ where: { companyId: company.id, active: true } }),
      prisma.roster.count({ where: { companyId: company.id, status: "PUBLISHED" } }),
      prisma.shift.count({
        where: { roster: { companyId: company.id }, startAt: { gte: weekStart, lte: weekEnd } },
      }),
      prisma.shift.count({
        where: { roster: { companyId: company.id }, status: "PENDING", startAt: { gte: now } },
      }),
      prisma.shift.findMany({
        where: { roster: { companyId: company.id }, startAt: { gte: dayStart, lte: dayEnd } },
        include: { guard: true, site: true },
        orderBy: { startAt: "asc" },
      }),
    ]),
  );

  console.log("\n=== /api/guards GET (text search) ===");
  await time("guards.findMany active=true no search", () =>
    prisma.guard.findMany({
      where: { companyId: company.id, active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  );
  await time("guards.findMany with 'sayed' contains-OR search", () =>
    prisma.guard.findMany({
      where: {
        companyId: company.id,
        active: true,
        OR: [
          { firstName: { contains: "sayed", mode: "insensitive" } },
          { lastName: { contains: "sayed", mode: "insensitive" } },
          { phone: { contains: "sayed" } },
          { email: { contains: "sayed", mode: "insensitive" } },
          { licenceNumber: { contains: "sayed", mode: "insensitive" } },
        ],
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  );

  console.log("\n=== /api/sites GET ===");
  await time("sites.findMany", () =>
    prisma.site.findMany({
      where: { companyId: company.id },
      orderBy: { name: "asc" },
    }),
  );

  console.log("\n=== /api/timesheets GET (current week) ===");
  await time("timesheets shifts findMany week", () =>
    prisma.shift.findMany({
      where: {
        roster: { companyId: company.id },
        status: { in: ["CONFIRMED", "WORKED"] },
        startAt: { gte: weekStart, lte: weekEnd },
      },
      include: { guard: true, site: true },
    }),
  );

  console.log("\n=== Indexes currently on the DB ===");
  const idx = await prisma.$queryRaw<
    Array<{ tablename: string; indexname: string; indexdef: string }>
  >`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;
  let lastTable = "";
  for (const i of idx) {
    if (i.tablename !== lastTable) {
      console.log(`  ${i.tablename}`);
      lastTable = i.tablename;
    }
    console.log(`    ${i.indexname.padEnd(50)} ${i.indexdef.replace(/^CREATE [A-Z ]*INDEX [^ ]+ /, "")}`);
  }

  console.log("\n=== Row counts ===");
  for (const t of [
    ["Company", "company"],
    ["AdminUser", "adminUser"],
    ["Guard", "guard"],
    ["Site", "site"],
    ["Roster", "roster"],
    ["Shift", "shift"],
    ["ShiftTemplate", "shiftTemplate"],
    ["SmsLog", "smsLog"],
    ["Timesheet", "timesheet"],
    ["GuardIdentity", "guardIdentity"],
    ["GuardAccount", "guardAccount"],
    ["PushSubscription", "pushSubscription"],
  ] as const) {
    const [label, model] = t;
    // @ts-expect-error dynamic prisma access for diagnostic purposes
    const c = await prisma[model].count();
    console.log(`  ${label.padEnd(18)} ${c}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
