import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

const STATUSES = [
  "DISPATCHED",
  "ACKNOWLEDGED",
  "ONSITE",
  "COMPLETED",
  "NO_RESPONSE",
  "CANCELLED",
] as const;

/**
 * GET /api/alarms/[id]
 * Returns one alarm with all responders + linked SmsLogs in chronological
 * order for the detail page timeline.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const alarm = await prisma.alarmJob.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    include: {
      responders: {
        orderBy: { dispatchedAt: "asc" },
        include: {
          guard: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
      },
      smsLogs: {
        orderBy: { receivedAt: "asc" },
        select: {
          id: true,
          direction: true,
          body: true,
          receivedAt: true,
          status: true,
          fromNumber: true,
          toNumber: true,
          alarmResponderId: true,
        },
      },
      site: {
        select: {
          id: true,
          name: true,
          address: true,
          contactName: true,
          contactPhone: true,
        },
      },
    },
  });
  if (!alarm) return jsonError("not found", 404);

  return NextResponse.json(alarm);
}

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  notes: z.string().optional().or(z.literal("").transform(() => null)),
  clientName: z.string().optional().or(z.literal("").transform(() => null)),
  clientEmail: z.string().email().optional().or(z.literal("").transform(() => null)),
  clientPhone: z.string().optional().or(z.literal("").transform(() => null)),
});

/**
 * PATCH /api/alarms/[id]
 * Manual updates: status, notes, client contact info. Setting status to
 * COMPLETED stamps resolvedAt; clearing to anything else clears resolvedAt
 * so the dashboard "still open" filter doesn't get confused.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const existing = await prisma.alarmJob.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    select: { id: true, status: true },
  });
  if (!existing) return jsonError("not found", 404);

  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (data.status) {
    updateData.status = data.status;
    if (data.status === "COMPLETED" && existing.status !== "COMPLETED") {
      updateData.resolvedAt = new Date();
    } else if (data.status !== "COMPLETED" && existing.status === "COMPLETED") {
      updateData.resolvedAt = null;
    }
  }
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.clientName !== undefined) updateData.clientName = data.clientName;
  if (data.clientEmail !== undefined) updateData.clientEmail = data.clientEmail;
  if (data.clientPhone !== undefined) updateData.clientPhone = data.clientPhone;

  const updated = await prisma.alarmJob.update({
    where: { id: params.id },
    data: updateData,
  });
  return NextResponse.json(updated);
}
