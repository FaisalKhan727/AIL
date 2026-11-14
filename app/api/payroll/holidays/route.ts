import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

// Victorian public holidays from business.vic.gov.au (2026 and 2027 lists).
// 2027 AFL Grand Final Friday is not announced yet, so it's left out; add it
// when the state gazettes it. Other states add their own.
const VIC_HOLIDAYS: [string, string][] = [
  ["2026-01-01", "New Year's Day"], ["2026-01-26", "Australia Day"], ["2026-03-09", "Labour Day"],
  ["2026-04-03", "Good Friday"], ["2026-04-04", "Easter Saturday"], ["2026-04-05", "Easter Sunday"], ["2026-04-06", "Easter Monday"],
  ["2026-04-25", "ANZAC Day"], ["2026-06-08", "King's Birthday"], ["2026-09-25", "Friday before the AFL Grand Final"],
  ["2026-11-03", "Melbourne Cup"], ["2026-12-25", "Christmas Day"], ["2026-12-26", "Boxing Day"], ["2026-12-28", "Boxing Day (additional day)"],
  ["2027-01-01", "New Year's Day"], ["2027-01-26", "Australia Day"], ["2027-03-08", "Labour Day"],
  ["2027-03-26", "Good Friday"], ["2027-03-27", "Easter Saturday"], ["2027-03-28", "Easter Sunday"], ["2027-03-29", "Easter Monday"],
  ["2027-04-25", "ANZAC Day"], ["2027-06-14", "King's Birthday"], ["2027-11-02", "Melbourne Cup"],
  ["2027-12-25", "Christmas Day"], ["2027-12-27", "Christmas Day (additional day)"], ["2027-12-26", "Boxing Day"], ["2027-12-28", "Boxing Day (additional day)"],
];

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const rows = await prisma.publicHoliday.findMany({ where: { companyId: auth.companyId }, orderBy: { date: "asc" } });
  return NextResponse.json(rows.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), name: h.name })));
}

const schema = z.union([
  z.object({ preset: z.literal("VIC") }),
  z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(2).max(80) }),
]);

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Give a date and a name.", 400);
  const list = "preset" in parsed.data ? VIC_HOLIDAYS : [[parsed.data.date, parsed.data.name] as [string, string]];
  let added = 0;
  for (const [date, name] of list) {
    const r = await prisma.publicHoliday.upsert({
      where: { companyId_date: { companyId: auth.companyId, date: new Date(`${date}T00:00:00.000Z`) } },
      update: {},
      create: { companyId: auth.companyId, date: new Date(`${date}T00:00:00.000Z`), name },
    });
    if (r) added++;
  }
  return NextResponse.json({ ok: true, added }, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("id required", 400);
  await prisma.publicHoliday.deleteMany({ where: { id, companyId: auth.companyId } });
  return NextResponse.json({ ok: true });
}
