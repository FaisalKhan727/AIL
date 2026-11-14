import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { actorName } from "@/lib/server/crud";
import { serialiseTimesheet, timesheetInclude } from "@/lib/server/payroll";

const schema = z.object({
  action: z.enum(["approve", "dispute", "reopen", "edit"]),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  breakMins: z.coerce.number().int().min(0).max(600).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const d = parsed.data;
  const s = await prisma.shift.findFirst({ where: { id: params.id, roster: { companyId: auth.companyId }, guardId: { not: null } } });
  if (!s) return jsonError("not found", 404);
  if (s.payRunId) return jsonError("This timesheet is in a pay run and can't be changed. Delete the draft pay run first.", 409);
  const who = actorName(auth);

  if (d.action === "edit") {
    const start = d.start ? new Date(d.start) : s.workedStart ?? s.startAt;
    const end = d.end ? new Date(d.end) : s.workedEnd ?? s.endAt;
    if (end <= start) return jsonError("The finish time must be after the start time.", 400);
    if (end.getTime() - start.getTime() > 24 * 3_600_000) return jsonError("A timesheet can't be longer than 24 hours.", 400);
    await prisma.shift.update({
      where: { id: s.id },
      data: {
        workedStart: start,
        workedEnd: end,
        breakMins: d.breakMins ?? s.breakMins,
        tsNote: d.note ?? s.tsNote,
        // An edit is a change to what's being paid: it needs approving again.
        tsStatus: "PENDING",
        tsApprovedAt: null,
        tsApprovedBy: null,
      },
    });
  } else if (d.action === "approve") {
    await prisma.shift.update({
      where: { id: s.id },
      data: { tsStatus: "APPROVED", tsApprovedAt: new Date(), tsApprovedBy: who, status: "WORKED", ...(d.note ? { tsNote: d.note } : {}) },
    });
  } else if (d.action === "dispute") {
    if (!d.note || d.note.length < 3) return jsonError("Say what's wrong so it can be fixed.", 400);
    await prisma.shift.update({ where: { id: s.id }, data: { tsStatus: "DISPUTED", tsNote: d.note, tsApprovedAt: null, tsApprovedBy: null } });
  } else {
    await prisma.shift.update({ where: { id: s.id }, data: { tsStatus: "PENDING", tsApprovedAt: null, tsApprovedBy: null } });
  }
  const fresh = await prisma.shift.findUniqueOrThrow({ where: { id: s.id }, include: timesheetInclude });
  return NextResponse.json(serialiseTimesheet(fresh));
}
