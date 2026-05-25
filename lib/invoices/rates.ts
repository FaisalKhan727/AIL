import { prisma } from "@/lib/prisma";

/**
 * Per-source flat rate for alarm invoicing. Stored as Setting rows so
 * each company can configure its own pricing without a schema change.
 *
 * Setting key shape: `alarm.rate.<slug>` where slug is a kebab-case
 * lower-case version of the source name. So "Guardian Security Group"
 * becomes `alarm.rate.guardian-security-group`.
 */

export function sourceSlug(source: string): string {
  return source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function rateKey(source: string): string {
  return `alarm.rate.${sourceSlug(source)}`;
}

export async function getRateForSource(
  companyId: string,
  source: string,
): Promise<number> {
  const row = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key: rateKey(source) } },
  });
  if (!row) return 0;
  const n = Number.parseFloat(row.value);
  return Number.isFinite(n) ? n : 0;
}

export async function setRateForSource(
  companyId: string,
  source: string,
  rate: number,
): Promise<void> {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("rate must be a non-negative number");
  }
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: rateKey(source) } },
    update: { value: rate.toFixed(2) },
    create: { companyId, key: rateKey(source), value: rate.toFixed(2) },
  });
}

/**
 * List every per-source rate configured for the company. Inverts the
 * settings rows back into { source: human, rate: number }. The source
 * label is reconstructed from the slug — for display only, the canonical
 * source string still lives on AlarmJob.source.
 */
export async function getAllRates(
  companyId: string,
): Promise<Array<{ key: string; slug: string; rate: number }>> {
  const rows = await prisma.setting.findMany({
    where: { companyId, key: { startsWith: "alarm.rate." } },
  });
  return rows.map((r) => ({
    key: r.key,
    slug: r.key.replace(/^alarm\.rate\./, ""),
    rate: Number.parseFloat(r.value) || 0,
  }));
}

/**
 * Distinct source names used by this company's alarms. Used to populate
 * the rate-config dropdown.
 */
export async function distinctSources(companyId: string): Promise<string[]> {
  const rows = await prisma.alarmJob.findMany({
    where: { companyId },
    select: { source: true },
    distinct: ["source"],
    orderBy: { source: "asc" },
  });
  return rows.map((r) => r.source);
}
