// Company-scoped CRUD route factories for the simpler resources (clients,
// vehicles, equipment, subcontractors…). Every query is filtered by the
// signed-in admin's companyId, and every foreign key in the payload is
// checked to belong to the same company before it is written.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin, type AdminAuth } from "@/lib/api";

type Delegate = { findMany: any; findFirst: any; create: any; update: any; delete: any };
const delegate = (name: string): Delegate => (prisma as any)[name];

// --- zod field helpers. `undefined` stays undefined so PATCH leaves the
// column alone; an empty string clears it.
export const zStr = (max = 200) => z.string().trim().min(1).max(max);
export const zOptStr = (max = 500) =>
  z.string().trim().max(max).nullish().transform((v) => (v === undefined ? undefined : v || null));
export const zOptId = z.string().nullish().transform((v) => (v === undefined ? undefined : v || null));
export const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Date must be yyyy-MM-dd")
  .transform((v) => new Date(`${v.slice(0, 10)}T00:00:00.000Z`));
export const zOptDate = z
  .string()
  .nullish()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}/.test(v), "Date must be yyyy-MM-dd")
  .transform((v) => (v === undefined ? undefined : v ? new Date(`${v.slice(0, 10)}T00:00:00.000Z`) : null));
export const zOptInt = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : Math.round(Number(v))))
  .refine((v) => v === undefined || v === null || Number.isFinite(v), "Must be a number");
export const zNum = z.coerce.number().finite();
export const zBool = z.boolean().optional();

interface Options {
  model: string;
  schema: z.ZodObject<any>;
  include?: Record<string, unknown>;
  orderBy?: unknown;
  /** payload field -> prisma delegate it must reference within the company */
  refs?: Record<string, string>;
  /** Return a message to refuse the delete. */
  guardDelete?: (row: any) => Promise<string | null>;
}

async function checkRefs(refs: Options["refs"], data: Record<string, unknown>, companyId: string): Promise<string | null> {
  for (const [field, model] of Object.entries(refs ?? {})) {
    const id = data[field];
    if (!id) continue;
    const found = await delegate(model).findFirst({ where: { id, companyId }, select: { id: true } });
    if (!found) return `${field} does not belong to this company`;
  }
  return null;
}

function firstIssue(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? `${i.path.join(".") || "payload"}: ${i.message}` : "validation";
}

export function collection(o: Options) {
  return {
    async GET() {
      const auth = await requireAdmin();
      if ("error" in auth) return auth.error;
      const rows = await delegate(o.model).findMany({
        where: { companyId: auth.companyId },
        include: o.include,
        orderBy: o.orderBy,
      });
      return NextResponse.json(rows);
    },
    async POST(req: Request) {
      const auth = await requireAdmin();
      if ("error" in auth) return auth.error;
      const parsed = o.schema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
      const bad = await checkRefs(o.refs, parsed.data, auth.companyId);
      if (bad) return jsonError(bad, 400);
      const row = await delegate(o.model).create({ data: { ...parsed.data, companyId: auth.companyId }, include: o.include });
      return NextResponse.json(row, { status: 201 });
    },
  };
}

export function item(o: Options) {
  const load = (id: string, auth: AdminAuth) =>
    delegate(o.model).findFirst({ where: { id, companyId: auth.companyId }, include: o.include });
  return {
    async GET(_req: Request, { params }: { params: { id: string } }) {
      const auth = await requireAdmin();
      if ("error" in auth) return auth.error;
      const row = await load(params.id, auth);
      return row ? NextResponse.json(row) : jsonError("not found", 404);
    },
    async PATCH(req: Request, { params }: { params: { id: string } }) {
      const auth = await requireAdmin();
      if ("error" in auth) return auth.error;
      if (!(await load(params.id, auth))) return jsonError("not found", 404);
      const parsed = o.schema.partial().safeParse(await req.json().catch(() => null));
      if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
      const bad = await checkRefs(o.refs, parsed.data, auth.companyId);
      if (bad) return jsonError(bad, 400);
      const row = await delegate(o.model).update({ where: { id: params.id }, data: parsed.data, include: o.include });
      return NextResponse.json(row);
    },
    async DELETE(_req: Request, { params }: { params: { id: string } }) {
      const auth = await requireAdmin();
      if ("error" in auth) return auth.error;
      const row = await load(params.id, auth);
      if (!row) return jsonError("not found", 404);
      const refusal = await o.guardDelete?.(row);
      if (refusal) return jsonError(refusal, 409);
      await delegate(o.model).delete({ where: { id: params.id } });
      return NextResponse.json({ ok: true });
    },
  };
}

/** Next sequential reference (alarm / incident / invoice number) for a company. */
export async function nextRef(model: "alarm" | "incident" | "invoice", companyId: string): Promise<number> {
  const field = model === "invoice" ? "number" : "ref";
  const last = await delegate(model).findFirst({ where: { companyId }, orderBy: { [field]: "desc" }, select: { [field]: true } });
  return (last?.[field] ?? (model === "invoice" ? 1000 : 4000)) + 1;
}

export const actorName = (auth: AdminAuth) => auth.session.user.name || "Admin";
