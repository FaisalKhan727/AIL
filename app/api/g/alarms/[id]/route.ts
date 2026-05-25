import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/guard-auth";

/**
 * GET /api/g/alarms/[id]
 *
 * Guard-facing alarm detail. Returns the alarm IF the signed-in guard
 * has at least one AlarmResponder row on this alarm (i.e., they were
 * dispatched to it). Tenant isolation by responder presence, not by
 * company — guards from other companies cannot see alarms they were
 * not dispatched to even if they share the parent company.
 *
 * Shape is deliberately narrower than the admin /api/alarms/[id]:
 * no createdBy, no notes, no audit fields the guard doesn't need.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;

  const guardRowIds = guard.memberships.map((m) => m.guardId);
  if (guardRowIds.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const alarm = await prisma.alarmJob.findFirst({
    where: {
      id: params.id,
      // Only return if at least one responder is assigned to one of the
      // signed-in guard's Guard rows. Strict tenant + ownership check.
      responders: { some: { guardId: { in: guardRowIds } } },
    },
    select: {
      id: true,
      docket: true,
      source: true,
      sourceReference: true,
      alarmType: true,
      priority: true,
      status: true,
      siteName: true,
      siteAddress: true,
      siteLatitude: true,
      siteLongitude: true,
      receivedAt: true,
      description: true,
      specialInstructions: true,
      bureau: true,
      areaLabel: true,
      zoneLabel: true,
      resolvedAt: true,
      // The guard's own responder row(s) — show their dispatch + response state.
      responders: {
        where: { guardId: { in: guardRowIds } },
        orderBy: { dispatchedAt: "desc" },
        select: {
          id: true,
          dispatchedAt: true,
          acknowledgedAt: true,
          onsiteAt: true,
          offsiteAt: true,
          responseResult: true,
        },
      },
    },
  });

  if (!alarm) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    ...alarm,
    // The number the guard texts back to from the PWA "Reply via SMS"
    // deep-link. Same Twilio number admin SMS comes from.
    replyToPhone: process.env.TWILIO_FROM_NUMBER ?? null,
  });
}
