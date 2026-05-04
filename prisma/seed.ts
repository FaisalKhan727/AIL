import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateConfirmCode } from "../lib/codes";

const prisma = new PrismaClient();

async function ensureUniqueCode(): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const code = generateConfirmCode();
    const exists = await prisma.shift.findUnique({ where: { confirmCode: code } });
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique confirm code");
}

async function main() {
  console.log("\n🌱 Seeding database...\n");

  const adminEmail = "info@auswidesecurityexperts.com.au";
const adminPassword = "Auswide@2016";
const passwordHash = await bcrypt.hash(adminPassword, 10);

const admin = await prisma.adminUser.upsert({
  where: { email: adminEmail },
  update: {},
  create: {
    email: adminEmail,
    passwordHash,
    name: "Admin",
    role: "OWNER",
  },
});

console.log("=================================================");
console.log("  ADMIN LOGIN — CHANGE THIS BEFORE PRODUCTION!");
console.log(`  Email:    ${adminEmail}`);
console.log(`  Password: ${adminPassword}`);
console.log("=================================================");

  // Guards
  const guardSeed = [
    { firstName: "Liam",     lastName: "Nguyen",   phone: "+61400000001", licenceNumber: "VIC-001234", payRate: "38.50" },
    { firstName: "Aaliyah",  lastName: "Patel",    phone: "+61400000002", licenceNumber: "VIC-001235", payRate: "38.50" },
    { firstName: "Marcus",   lastName: "Smith",    phone: "+61400000003", licenceNumber: "VIC-001236", payRate: "42.00" },
    { firstName: "Sofia",    lastName: "Rossi",    phone: "+61400000004", licenceNumber: "VIC-001237", payRate: "38.50" },
    { firstName: "Daniel",   lastName: "O'Brien",  phone: "+61400000005", licenceNumber: "VIC-001238", payRate: "40.00" },
  ];

  for (const g of guardSeed) {
    await prisma.guard.upsert({
      where: { phone: g.phone },
      update: {},
      create: {
        firstName: g.firstName,
        lastName: g.lastName,
        phone: g.phone,
        licenceNumber: g.licenceNumber,
        payRate: g.payRate,
        active: true,
      },
    });
  }

  const guards = await prisma.guard.findMany();

  // Sites
  const siteSeed = [
    { name: "Crown Casino",    address: "8 Whiteman St, Southbank VIC" },
    { name: "QV Square",       address: "210 Lonsdale St, Melbourne VIC" },
    { name: "Marvel Stadium",  address: "740 Bourke St, Docklands VIC" },
  ];

  for (const s of siteSeed) {
    const exists = await prisma.site.findFirst({ where: { name: s.name } });
    if (!exists) await prisma.site.create({ data: s });
  }

  const sites = await prisma.site.findMany();

  // Roster — current week, Mon..Sun
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + monOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const existingRoster = await prisma.roster.findFirst({
    where: { startDate: weekStart, status: "PUBLISHED" },
  });

  if (!existingRoster) {
    const roster = await prisma.roster.create({
      data: {
        name: `Week of ${weekStart.toISOString().slice(0, 10)}`,
        startDate: weekStart,
        endDate: weekEnd,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    // Build 8 PENDING shifts across guards/sites
    const plan = [
      { dayOffset: 0, hour: 18, len: 8, guardIdx: 0, siteIdx: 0, role: "Static" },
      { dayOffset: 0, hour: 22, len: 8, guardIdx: 1, siteIdx: 1, role: "Patrol" },
      { dayOffset: 1, hour: 14, len: 8, guardIdx: 2, siteIdx: 2, role: "Crowd" },
      { dayOffset: 2, hour: 22, len: 8, guardIdx: 0, siteIdx: 1, role: "Patrol" },
      { dayOffset: 3, hour: 18, len: 8, guardIdx: 3, siteIdx: 0, role: "Static" },
      { dayOffset: 4, hour: 20, len: 8, guardIdx: 4, siteIdx: 2, role: "Crowd" },
      { dayOffset: 5, hour: 20, len: 8, guardIdx: 0, siteIdx: 0, role: "Static" },
      { dayOffset: 6, hour: 10, len: 8, guardIdx: 1, siteIdx: 1, role: "Patrol" },
    ];

    for (const p of plan) {
      const startAt = new Date(weekStart);
      startAt.setDate(weekStart.getDate() + p.dayOffset);
      startAt.setHours(p.hour, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(startAt.getHours() + p.len);

      const code = await ensureUniqueCode();
      await prisma.shift.create({
        data: {
          rosterId: roster.id,
          guardId: guards[p.guardIdx].id,
          siteId: sites[p.siteIdx].id,
          startAt,
          endAt,
          role: p.role,
          status: "PENDING",
          confirmCode: code,
        },
      });
    }
  }

  // Default settings
  const defaults: Record<string, string> = {
    company_name: process.env.COMPANY_NAME ?? "My Security Co",
    timezone: process.env.APP_TIMEZONE ?? "Australia/Melbourne",
    default_pay_rate: "38.50",
    sms_template_roster: `Hi {firstName}, your shifts for {rosterName}:

{shiftList}

Reply with shift # + YES/NO for each.
E.g. "1 YES, 2 NO, 3 YES"
Or reply ALL YES / ALL NO.

Ref: {firstConfirmCode}`,
    sms_template_reply_summary: `Thanks {firstName}. Confirmed: {confirmedCount}, Rejected: {rejectedCount}, Pending: {pendingCount}.`,
    sms_template_unparsed: `Hi {firstName}, we couldn't read your reply. Please reply with shift # then YES or NO (e.g. "1 YES, 2 NO") or ALL YES / ALL NO.`,
  };

  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  console.log(`✅ Seeded admin (${admin.email}), ${guards.length} guards, ${sites.length} sites, 1 roster.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
