// Database-side helpers shared by the admin licence routes, the guard-app
// routes and the reminder job.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LICENCE_TYPES, STATES, daysUntilExpiry, isCurrent, licenceStatus, licenceType } from "@/lib/licences";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-MM-dd")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const documentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  // data:<mime>;base64,<payload> — images are downscaled in the browser first.
  dataUrl: z.string().max(2_800_000, "File is too large (2 MB max)"),
});

export const licenceFieldsSchema = z.object({
  type: z.enum(LICENCE_TYPES.map((t) => t.key) as [string, ...string[]]),
  number: z.string().trim().min(2, "Licence number is required").max(40),
  state: z.enum(STATES),
  issueDate: dateOnly,
  expiryDate: dateOnly,
  document: documentSchema.optional(),
});

export const licenceCreateSchema = licenceFieldsSchema.extend({ guardId: z.string().min(1) });
export const licenceUpdateSchema = licenceFieldsSchema.partial();

/** Date-only values are stored at UTC midnight so they never shift a day. */
export function parseDateOnly(s: string | undefined): Date | null {
  return s ? new Date(`${s}T00:00:00.000Z`) : null;
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function decodeDataUrl(dataUrl: string): { mime: string; data: Buffer } | null {
  const m = dataUrl.match(/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m || !ALLOWED_MIME.has(m[1])) return null;
  const data = Buffer.from(m[2], "base64");
  if (data.length === 0 || data.length > 2_000_000) return null;
  return { mime: m[1], data };
}

export async function saveDocument(licenceId: string, doc: { name: string; dataUrl: string }): Promise<boolean> {
  const decoded = decodeDataUrl(doc.dataUrl);
  if (!decoded) return false;
  await prisma.licenceDocument.upsert({
    where: { licenceId },
    update: { mime: decoded.mime, name: doc.name, data: decoded.data, uploadedAt: new Date() },
    create: { licenceId, mime: decoded.mime, name: doc.name, data: decoded.data },
  });
  return true;
}

export function logEvent(licenceId: string, actor: string, action: string, detail?: string) {
  return prisma.licenceEvent.create({ data: { licenceId, actor, action, detail } });
}

// Never select the document bytes in list queries.
export const licenceInclude = {
  guard: { select: { id: true, firstName: true, lastName: true, phone: true, active: true } },
  document: { select: { name: true, mime: true, uploadedAt: true } },
} satisfies Prisma.LicenceInclude;

type LicenceRow = Prisma.LicenceGetPayload<{ include: typeof licenceInclude }>;

export function serialiseLicence(l: LicenceRow, now: Date = new Date()) {
  const def = licenceType(l.type);
  return {
    id: l.id,
    guardId: l.guardId,
    guardName: `${l.guard.firstName} ${l.guard.lastName}`,
    guardActive: l.guard.active,
    type: l.type,
    typeLabel: def.label,
    typeShort: def.short,
    security: def.security,
    number: l.number,
    state: l.state,
    issueDate: l.issueDate ? l.issueDate.toISOString().slice(0, 10) : null,
    expiryDate: l.expiryDate ? l.expiryDate.toISOString().slice(0, 10) : null,
    daysLeft: daysUntilExpiry(l.expiryDate, now),
    status: licenceStatus(l, now),
    verification: l.verification,
    source: l.source,
    verifiedAt: l.verifiedAt,
    verifiedBy: l.verifiedBy,
    verifyMethod: l.verifyMethod,
    verifyNote: l.verifyNote,
    document: l.document,
    createdAt: l.createdAt,
  };
}

export type LicenceDto = ReturnType<typeof serialiseLicence>;

/**
 * Keep Guard.licenceNumber / licenceExpiry (used by the guard list, CSV import
 * and older screens) pointing at the guard's best security licence: a current
 * verified one if there is one, otherwise whichever expires last.
 */
export async function syncLegacyGuardFields(guardId: string): Promise<void> {
  const all = await prisma.licence.findMany({ where: { guardId } });
  const security = all.filter((l) => licenceType(l.type).security);
  if (security.length === 0) return;
  const byExpiry = (a: (typeof all)[number], b: (typeof all)[number]) =>
    (b.expiryDate?.getTime() ?? Infinity) - (a.expiryDate?.getTime() ?? Infinity);
  const current = security.filter((l) => isCurrent(l)).sort(byExpiry);
  const best = current[0] ?? [...security].sort(byExpiry)[0];
  await prisma.guard.update({
    where: { id: guardId },
    data: { licenceNumber: best.number, licenceExpiry: best.expiryDate },
  });
}

/** Name of another guard in the company holding the same licence number, if any. */
export async function findDuplicateHolder(
  companyId: string,
  l: { id?: string; guardId: string; type: string; number: string },
): Promise<string | null> {
  const dup = await prisma.licence.findFirst({
    where: {
      companyId,
      type: l.type,
      number: { equals: l.number.trim(), mode: "insensitive" },
      guardId: { not: l.guardId },
      ...(l.id ? { id: { not: l.id } } : {}),
    },
    include: { guard: { select: { firstName: true, lastName: true } } },
  });
  return dup ? `${dup.guard.firstName} ${dup.guard.lastName}` : null;
}

export async function getSettingValue(companyId: string, key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { companyId_key: { companyId, key } } });
  return row?.value ?? null;
}

/**
 * The guard form still has a single "licence number / expiry" pair. When an
 * admin fills it in, mirror it into the registry: add the licence if it's new,
 * or update the expiry (which resets verification) if the number is known.
 */
export async function adoptLegacyLicence(
  companyId: string,
  guardId: string,
  number: string | undefined,
  expiry: Date | null | undefined,
  actor: string,
): Promise<void> {
  const num = number?.trim();
  if (!num) return;
  const existing = await prisma.licence.findFirst({
    where: { guardId, number: { equals: num, mode: "insensitive" } },
  });
  if (!existing) {
    const created = await prisma.licence.create({
      data: { companyId, guardId, type: "SECURITY_1A", number: num, state: "VIC", expiryDate: expiry ?? null, source: "ADMIN" },
    });
    await logEvent(created.id, actor, "CREATED", "Entered on the guard record");
    return;
  }
  if (expiry !== undefined && (existing.expiryDate?.getTime() ?? null) !== (expiry?.getTime() ?? null)) {
    await prisma.licence.update({
      where: { id: existing.id },
      data: { expiryDate: expiry, verification: "UNVERIFIED", verifiedAt: null, verifiedBy: null, verifyMethod: null, verifyNote: null, lastAlertDays: null },
    });
    await logEvent(existing.id, actor, "UPDATED", "Expiry changed on the guard record — verification reset");
  }
}
