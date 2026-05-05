import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateConfirmCode } from "../lib/codes";

const prisma = new PrismaClient();

const AUSWIDE_ID = "co_auswide";
const ACS_ID = "co_acs";

async function ensureUniqueCode(): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const code = generateConfirmCode();
    const exists = await prisma.shift.findUnique({ where: { confirmCode: code } });
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique confirm code");
}

async function ensureCompany(id: string, name: string, slug: string) {
  return prisma.company.upsert({
    where: { id },
    update: { name, slug },
    create: { id, name, slug },
  });
}

async function ensureAdmin(email: string, password: string, companyId: string, displayName: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.adminUser.upsert({
    where: { email },
    update: { companyId, name: displayName },
    create: { email, passwordHash, name: displayName, role: "OWNER", companyId },
  });
}

const defaultSettings = (companyName: string): Record<string, string> => ({
  company_name: companyName,
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
});

async function seedSettings(companyId: string, companyName: string) {
  for (const [key, value] of Object.entries(defaultSettings(companyName))) {
    await prisma.setting.upsert({
      where: { companyId_key: { companyId, key } },
      update: {},
      create: { companyId, key, value },
    });
  }
}

async function main() {
  console.log("\n🌱 Seeding database...\n");

  // 1. Companies.
  const auswide = await ensureCompany(AUSWIDE_ID, "Auswide Security", "auswide");
  const acs = await ensureCompany(ACS_ID, "ACS Security", "acs");

  // 2. Admin users — one OWNER per company.
  const auswideAdminEmail = "info@auswidesecurityexperts.com.au";
  const auswideAdminPassword = "Auswide@2016";
  await ensureAdmin(auswideAdminEmail, auswideAdminPassword, auswide.id, "Auswide Admin");

  const acsAdminEmail = "info@alliedcs.com.au";
  const acsAdminPassword = "Allied@2026";
  await ensureAdmin(acsAdminEmail, acsAdminPassword, acs.id, "ACS Admin");

  console.log("=================================================");
  console.log("  ADMIN LOGINS — CHANGE BEFORE PRODUCTION");
  console.log(`  Auswide: ${auswideAdminEmail} / ${auswideAdminPassword}`);
  console.log(`  ACS:     ${acsAdminEmail} / ${acsAdminPassword}`);
  console.log("=================================================");

  // 3. Settings for both companies.
  await seedSettings(auswide.id, "Auswide Security");
  await seedSettings(acs.id, "ACS Security");

  // 4. Sample guards/sites/roster only for Auswide (preserve dev workflow).
  //    ACS starts empty — operators add their own.
  const guardSeed = [
    { firstName: "Liam",     lastName: "Nguyen",   phone: "+61400000001", licenceNumber: "VIC-001234", payRate: "38.50" },
    { firstName: "Aaliyah",  lastName: "Patel",    phone: "+61400000002", licenceNumber: "VIC-001235", payRate: "38.50" },
    { firstName: "Marcus",   lastName: "Smith",    phone: "+61400000003", licenceNumber: "VIC-001236", payRate: "42.00" },
    { firstName: "Sofia",    lastName: "Rossi",    phone: "+61400000004", licenceNumber: "VIC-001237", payRate: "38.50" },
    { firstName: "Daniel",   lastName: "O'Brien",  phone: "+61400000005", licenceNumber: "VIC-001238", payRate: "40.00" },
  ];

  for (const g of guardSeed) {
    await prisma.guard.upsert({
      where: { companyId_phone: { companyId: auswide.id, phone: g.phone } },
      update: {},
      create: {
        firstName: g.firstName,
        lastName: g.lastName,
        phone: g.phone,
        licenceNumber: g.licenceNumber,
        payRate: g.payRate,
        active: true,
        companyId: auswide.id,
      },
    });
  }

  const guards = await prisma.guard.findMany({ where: { companyId: auswide.id } });

  const siteSeed = [
    { name: "Crown Casino",    address: "8 Whiteman St, Southbank VIC" },
    { name: "QV Square",       address: "210 Lonsdale St, Melbourne VIC" },
    { name: "Marvel Stadium",  address: "740 Bourke St, Docklands VIC" },
  ];

  for (const s of siteSeed) {
    const exists = await prisma.site.findFirst({ where: { name: s.name, companyId: auswide.id } });
    if (!exists) await prisma.site.create({ data: { ...s, companyId: auswide.id } });
  }

  const sites = await prisma.site.findMany({ where: { companyId: auswide.id } });

  // Shift templates per site. Crown Casino has the canonical 3-template
  // pattern (Morning/Afternoon/Overnight, including a midnight-crossing one),
  // QV Square has 2 patrol templates, Marvel Stadium intentionally has none
  // so the empty-state UI has somewhere to render.
  const templateSeed: Record<
    string,
    { name: string; startTime: string; endTime: string; role?: string; daysOfWeek?: string; sortOrder?: number }[]
  > = {
    "Crown Casino": [
      { name: "Morning",   startTime: "08:00", endTime: "14:00", role: "Static Guard", sortOrder: 0 },
      { name: "Afternoon", startTime: "14:00", endTime: "19:00", role: "Static Guard", sortOrder: 1 },
      { name: "Overnight", startTime: "19:00", endTime: "08:00", role: "Static Guard", sortOrder: 2 },
    ],
    "QV Square": [
      { name: "Day Patrol",   startTime: "09:00", endTime: "17:00", role: "Patrol", daysOfWeek: "MON,TUE,WED,THU,FRI", sortOrder: 0 },
      { name: "Night Patrol", startTime: "21:00", endTime: "05:00", role: "Patrol", sortOrder: 1 },
    ],
  };

  for (const site of sites) {
    const tpls = templateSeed[site.name];
    if (!tpls) continue;
    for (const t of tpls) {
      const exists = await prisma.shiftTemplate.findFirst({
        where: { siteId: site.id, name: t.name },
      });
      if (exists) continue;
      const crossesMidnight = t.endTime <= t.startTime;
      await prisma.shiftTemplate.create({
        data: {
          siteId: site.id,
          name: t.name,
          startTime: t.startTime,
          endTime: t.endTime,
          crossesMidnight,
          role: t.role,
          daysOfWeek: t.daysOfWeek ?? "MON,TUE,WED,THU,FRI,SAT,SUN",
          sortOrder: t.sortOrder ?? 0,
        },
      });
    }
  }

  const now = new Date();
  const day = now.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + monOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const existingRoster = await prisma.roster.findFirst({
    where: { startDate: weekStart, status: "PUBLISHED", companyId: auswide.id },
  });

  if (!existingRoster) {
    const roster = await prisma.roster.create({
      data: {
        name: `Week of ${weekStart.toISOString().slice(0, 10)}`,
        startDate: weekStart,
        endDate: weekEnd,
        status: "PUBLISHED",
        publishedAt: new Date(),
        companyId: auswide.id,
      },
    });

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

  console.log(`✅ Seeded Auswide (${guards.length} guards, ${sites.length} sites, 1 roster) and ACS (empty).\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
