import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { decrypt, isEncrypted } from "@/lib/crypto";

/**
 * POST /api/guards/[id]/onboarding/decrypt
 *
 * OWNER-only. Returns the plaintext for one or more sensitive
 * onboarding fields and writes an AuditLog row with the actor, the
 * fields revealed, the operational reason, and the OnboardingData row
 * id. MANAGER role is hard-blocked.
 *
 * Body:
 *   {
 *     fields: ("tfn" | "bsb" | "accountNumber")[],
 *     reason: string  // >= 10 chars, free text — what they need it for
 *   }
 */
const bodySchema = z.object({
  fields: z
    .array(z.enum(["tfn", "bsb", "accountNumber"]))
    .min(1, "at least one field is required"),
  reason: z
    .string()
    .trim()
    .min(10, "reason must be at least 10 characters")
    .max(500, "reason is too long"),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (auth.role !== "OWNER") {
    return jsonError(
      "Only OWNER role can decrypt sensitive onboarding fields.",
      403,
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("validation", 400, parsed.error.flatten());
  }
  const { fields, reason } = parsed.data;

  const guard = await prisma.guard.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    select: { id: true, latestOnboardingSessionId: true },
  });
  if (!guard?.latestOnboardingSessionId) {
    return jsonError("No onboarding session for this guard.", 404);
  }

  const data = await prisma.onboardingData.findFirst({
    where: { onboardingSessionId: guard.latestOnboardingSessionId },
    select: {
      id: true,
      tfnEncrypted: true,
      bankBsbEncrypted: true,
      bankAccountNumberEncrypted: true,
    },
  });
  if (!data) {
    return jsonError("No onboarding data captured yet for this guard.", 404);
  }

  // Decrypt the requested fields. Legacy clear-text rows (captured
  // before the encryption deploy) are returned as-is — they were
  // technically also visible to every admin until the backfill ran.
  const result: { tfn?: string | null; bsb?: string | null; accountNumber?: string | null } = {};
  const decryptField = (column: string | null) => {
    if (!column) return null;
    if (!isEncrypted(column)) return column;
    return decrypt(column);
  };

  try {
    if (fields.includes("tfn")) result.tfn = decryptField(data.tfnEncrypted);
    if (fields.includes("bsb")) result.bsb = decryptField(data.bankBsbEncrypted);
    if (fields.includes("accountNumber")) {
      result.accountNumber = decryptField(data.bankAccountNumberEncrypted);
    }
  } catch (e: unknown) {
    return jsonError(
      e instanceof Error ? `decrypt failed: ${e.message}` : "decrypt failed",
      500,
    );
  }

  // AuditLog write is the operational record-of-truth for every
  // decrypt. Done AFTER the decryption succeeds so we don't pollute
  // the log with failed attempts (those return 500 above and can be
  // grepped from app logs).
  await prisma.auditLog.create({
    data: {
      companyId: auth.companyId,
      actorAdminUserId: auth.userId,
      action: "ONBOARDING_SENSITIVE_DECRYPTED",
      entityType: "OnboardingData",
      entityId: data.id,
      metadata: JSON.stringify({
        guardId: guard.id,
        fields,
        reason,
      }),
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        null,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
  });

  return NextResponse.json({ ok: true, ...result });
}
