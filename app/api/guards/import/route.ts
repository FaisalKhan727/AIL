import { NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { phoneE164 } from "@/lib/validators";

const rowSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: phoneE164,
  email: z.string().trim().email().optional().or(z.literal("").transform(() => undefined)),
  licenceNumber: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  licenceExpiry: z.string().optional().or(z.literal("").transform(() => undefined)),
  payRate: z.coerce.number().nonnegative().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { csv } = await req.json().catch(() => ({ csv: "" }));
  if (typeof csv !== "string" || !csv.trim()) return jsonError("csv content required");

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) return jsonError("csv parse failed", 400, parsed.errors);

  const created: string[] = [];
  const updated: string[] = [];
  const errors: { row: number; message: string }[] = [];

  let i = 0;
  for (const raw of parsed.data) {
    i++;
    const result = rowSchema.safeParse(raw);
    if (!result.success) {
      errors.push({ row: i, message: result.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
      continue;
    }
    const data = result.data;
    try {
      const existing = await prisma.guard.findUnique({ where: { phone: data.phone } });
      if (existing && existing.companyId !== auth.companyId) {
        errors.push({ row: i, message: `phone ${data.phone} already belongs to another company` });
        continue;
      }
      if (existing) {
        await prisma.guard.update({
          where: { id: existing.id },
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            licenceNumber: data.licenceNumber,
            licenceExpiry: data.licenceExpiry ? new Date(data.licenceExpiry) : null,
            payRate: data.payRate?.toString(),
          },
        });
        updated.push(data.phone);
      } else {
        await prisma.guard.create({
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            email: data.email,
            licenceNumber: data.licenceNumber,
            licenceExpiry: data.licenceExpiry ? new Date(data.licenceExpiry) : null,
            payRate: data.payRate?.toString(),
            active: true,
            companyId: auth.companyId,
          },
        });
        created.push(data.phone);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "unknown";
      errors.push({ row: i, message: msg });
    }
  }

  return NextResponse.json({
    createdCount: created.length,
    updatedCount: updated.length,
    errorCount: errors.length,
    errors,
  });
}
