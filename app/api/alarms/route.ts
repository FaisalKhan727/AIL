import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { reserveNextDocket } from "@/lib/alarms/docket";
import { dispatchAlarmSms } from "@/lib/alarms/dispatch";
import { phoneE164 } from "@/lib/validators";

const ALARM_TYPES = ["BURGLARY", "FIRE", "MEDICAL", "PANIC", "TAMPER", "DURESS", "OTHER"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const STATUSES = ["DISPATCHED", "ACKNOWLEDGED", "ONSITE", "COMPLETED", "NO_RESPONSE", "CANCELLED"] as const;

const internalResponder = z.object({
  type: z.literal("INTERNAL_GUARD"),
  guardId: z.string().min(1),
});
const externalResponder = z.object({
  type: z.literal("EXTERNAL_CONTRACTOR"),
  name: z.string().trim().min(1),
  phone: phoneE164,
  company: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
});

const createSchema = z.object({
  source: z.string().trim().min(1),
  sourceReference: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  alarmType: z.enum(ALARM_TYPES),
  priority: z.enum(PRIORITIES).default("HIGH"),
  siteName: z.string().trim().min(1),
  siteAddress: z.string().trim().min(1),
  siteLatitude: z.number().optional().nullable(),
  siteLongitude: z.number().optional().nullable(),
  siteId: z.string().optional().nullable(),
  clientName: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  clientEmail: z.string().trim().email().optional().or(z.literal("").transform(() => undefined)),
  clientPhone: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  description: z.string().optional().or(z.literal("").transform(() => undefined)),
  specialInstructions: z.string().optional().or(z.literal("").transform(() => undefined)),
  receivedAt: z.string().datetime().optional(),
  // Paste-intake metadata
  bureau: z.string().optional().or(z.literal("").transform(() => undefined)),
  areaLabel: z.string().optional().or(z.literal("").transform(() => undefined)),
  zoneLabel: z.string().optional().or(z.literal("").transform(() => undefined)),
  rawIntakeText: z.string().optional().or(z.literal("").transform(() => undefined)),
  parserUsed: z.string().optional().or(z.literal("").transform(() => undefined)),
  parseConfidence: z.string().optional().or(z.literal("").transform(() => undefined)),
  responder: z.union([internalResponder, externalResponder]),
});

/**
 * Create a new alarm + dispatch the SMS to the chosen responder.
 *
 * Two writes happen atomically inside the docket-reservation transaction:
 *   1. Reserve the next per-company docket
 *   2. Create the AlarmJob with that docket
 *   3. Create the AlarmResponder row
 * Then dispatch the SMS via dispatchAlarmSms() (which writes its own
 * SmsLog row and links it back to the responder).
 *
 * If the SMS dispatch fails (Twilio error), the AlarmJob still exists
 * with status=DISPATCHED — admin can use the future "Resend" action on
 * the detail page. We do NOT roll back the job creation on SMS failure
 * because losing the docket reservation is more annoying than a failed
 * dispatch that can be retried.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("validation", 400, parsed.error.flatten());
  }
  const data = parsed.data;

  // For INTERNAL_GUARD: verify the guard belongs to this company
  if (data.responder.type === "INTERNAL_GUARD") {
    const guard = await prisma.guard.findFirst({
      where: { id: data.responder.guardId, companyId: auth.companyId },
      select: { id: true, phone: true, firstName: true, lastName: true },
    });
    if (!guard) return jsonError("guard not in this company", 400);
  }

  // For siteId: verify it belongs to this company
  if (data.siteId) {
    const site = await prisma.site.findFirst({
      where: { id: data.siteId, companyId: auth.companyId },
      select: { id: true },
    });
    if (!site) return jsonError("siteId not in this company", 400);
  }

  // Atomic: reserve docket + create job + create responder
  const created = await prisma.$transaction(async (tx) => {
    const docket = await reserveNextDocket(tx, auth.companyId);
    const job = await tx.alarmJob.create({
      data: {
        companyId: auth.companyId,
        docket,
        source: data.source,
        sourceReference: data.sourceReference,
        alarmType: data.alarmType,
        priority: data.priority,
        siteName: data.siteName,
        siteAddress: data.siteAddress,
        siteLatitude: data.siteLatitude ?? undefined,
        siteLongitude: data.siteLongitude ?? undefined,
        siteId: data.siteId ?? undefined,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        clientPhone: data.clientPhone,
        receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
        description: data.description,
        specialInstructions: data.specialInstructions,
        bureau: data.bureau,
        areaLabel: data.areaLabel,
        zoneLabel: data.zoneLabel,
        rawIntakeText: data.rawIntakeText,
        parserUsed: data.parserUsed,
        parseConfidence: data.parseConfidence,
        status: "DISPATCHED",
        createdBy: auth.userId,
      },
    });
    const responder = await tx.alarmResponder.create({
      data: {
        alarmJobId: job.id,
        companyId: auth.companyId,
        responderType: data.responder.type,
        guardId: data.responder.type === "INTERNAL_GUARD" ? data.responder.guardId : undefined,
        externalName: data.responder.type === "EXTERNAL_CONTRACTOR" ? data.responder.name : undefined,
        externalPhone:
          data.responder.type === "INTERNAL_GUARD"
            ? "" // filled in below after we resolve from Guard.phone
            : data.responder.phone,
        externalCompany:
          data.responder.type === "EXTERNAL_CONTRACTOR" ? data.responder.company : undefined,
      },
    });
    // For INTERNAL_GUARD, copy the Guard's phone onto the responder row
    // so the inbound parser can match on it without a Guard join.
    if (data.responder.type === "INTERNAL_GUARD") {
      const g = await tx.guard.findUnique({
        where: { id: data.responder.guardId },
        select: { phone: true },
      });
      await tx.alarmResponder.update({
        where: { id: responder.id },
        data: { externalPhone: g?.phone ?? "" },
      });
    }
    // lastUsedAt on AlarmContact if external phone matches one
    if (data.responder.type === "EXTERNAL_CONTRACTOR") {
      await tx.alarmContact
        .update({
          where: {
            companyId_phone: { companyId: auth.companyId, phone: data.responder.phone },
          },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => undefined);
    }
    return { job, responderId: responder.id };
  });

  // Dispatch the SMS outside the transaction (it makes a network call).
  const dispatch = await dispatchAlarmSms(created.responderId);

  return NextResponse.json(
    {
      id: created.job.id,
      docket: created.job.docket,
      dispatch: dispatch.ok ? "sent" : "failed",
      dispatchError: dispatch.error,
    },
    { status: 201 },
  );
}

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(), // comma-separated
  priority: z.string().optional(),
  source: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * List alarms for the current company. Returns enough for the list table
 * + a time-on-site computed field from the first responder's onsite/offsite.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const queryParsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!queryParsed.success) {
    return jsonError("validation", 400, queryParsed.error.flatten());
  }
  const q = queryParsed.data;

  const where: Parameters<typeof prisma.alarmJob.findMany>[0] extends infer T
    ? T extends { where?: infer W }
      ? W
      : never
    : never = {
    companyId: auth.companyId,
  };

  if (q.status) {
    const statuses = q.status.split(",").map((s) => s.trim()).filter((s) => STATUSES.includes(s as typeof STATUSES[number]));
    if (statuses.length > 0) (where as { status?: unknown }).status = { in: statuses };
  }
  if (q.priority) {
    const priorities = q.priority.split(",").map((s) => s.trim()).filter((s) => PRIORITIES.includes(s as typeof PRIORITIES[number]));
    if (priorities.length > 0) (where as { priority?: unknown }).priority = { in: priorities };
  }
  if (q.source) {
    (where as { source?: unknown }).source = { contains: q.source, mode: "insensitive" };
  }
  if (q.q) {
    (where as { OR?: unknown }).OR = [
      { docket: { contains: q.q, mode: "insensitive" } },
      { sourceReference: { contains: q.q, mode: "insensitive" } },
      { siteName: { contains: q.q, mode: "insensitive" } },
      { clientName: { contains: q.q, mode: "insensitive" } },
      { description: { contains: q.q, mode: "insensitive" } },
    ];
  }

  const jobs = await prisma.alarmJob.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: q.limit,
    include: {
      responders: {
        orderBy: { dispatchedAt: "desc" },
        take: 1,
        include: {
          guard: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  const rows = jobs.map((j) => {
    const r = j.responders[0];
    const responderName = r
      ? r.responderType === "INTERNAL_GUARD"
        ? `${r.guard?.firstName ?? ""} ${r.guard?.lastName ?? ""}`.trim()
        : r.externalName
      : null;
    const onsiteMs =
      r?.onsiteAt && r?.offsiteAt
        ? Math.round((r.offsiteAt.getTime() - r.onsiteAt.getTime()) / 60_000)
        : null;
    return {
      id: j.id,
      docket: j.docket,
      receivedAt: j.receivedAt,
      source: j.source,
      sourceReference: j.sourceReference,
      siteName: j.siteName,
      clientName: j.clientName,
      alarmType: j.alarmType,
      priority: j.priority,
      status: j.status,
      responderName,
      timeOnSiteMin: onsiteMs,
    };
  });

  return NextResponse.json(rows);
}
