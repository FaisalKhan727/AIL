import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { DEFAULT_RULES, normaliseRules } from "@/lib/payroll";
import { getPaySettings } from "@/lib/server/payroll";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const s = await getPaySettings(auth.companyId);
  return NextResponse.json({ ...s, defaults: DEFAULT_RULES });
}

const schema = z.object({
  frequency: z.enum(["WEEKLY", "FORTNIGHTLY"]),
  anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rules: z.record(z.string(), z.unknown()),
});

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (auth.role !== "OWNER") return jsonError("Only an owner can change pay rules.", 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const rules = normaliseRules(parsed.data.rules);
  const put = (key: string, value: string) =>
    prisma.setting.upsert({ where: { companyId_key: { companyId: auth.companyId, key } }, update: { value }, create: { companyId: auth.companyId, key, value } });
  await prisma.$transaction([put("pay_rules", JSON.stringify(rules)), put("pay_frequency", parsed.data.frequency), put("pay_anchor", parsed.data.anchor)]);
  return NextResponse.json({ ok: true, rules });
}
