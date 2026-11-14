import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireGuard } from "@/lib/api";
import { VEHICLE_CHECK_ITEMS, closedJobStatus } from "@/lib/ops";

async function load(id: string, guardId: string) {
  return prisma.patrolJob.findFirst({
    where: { id, guardId },
    include: { run: { include: { stops: { orderBy: { position: "asc" } }, vehicle: true } }, scans: true },
  });
}
type Job = NonNullable<Awaited<ReturnType<typeof load>>>;

function serialise(job: Job) {
  const byStop = new Map(job.scans.map((s) => [s.stopId, s]));
  return {
    id: job.id,
    code: job.run.code,
    name: job.run.name,
    date: job.date.toISOString().slice(0, 10),
    status: job.status,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    vehicle: job.run.vehicle ? { id: job.run.vehicle.id, code: job.run.vehicle.code, rego: job.run.vehicle.rego } : null,
    checkItems: VEHICLE_CHECK_ITEMS,
    stops: job.run.stops.map((s) => {
      const scan = byStop.get(s.id);
      return { id: s.id, name: s.name, address: s.address, instructions: s.instructions, status: scan?.status ?? "PENDING", at: scan?.at ?? null, note: scan?.note ?? null };
    }),
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const job = await load(params.id, auth.guardId);
  return job ? NextResponse.json(serialise(job)) : jsonError("Patrol not found", 404);
}

const coord = z.number().finite().optional();
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    check: z.object({ odometer: z.coerce.number().int().min(0).optional(), fuel: z.string().max(20).optional(), failed: z.array(z.string().max(60)).max(20), notes: z.string().trim().max(500).optional() }).optional(),
  }),
  z.object({ action: z.literal("scan"), stopId: z.string().min(1), note: z.string().trim().max(300).optional(), lat: coord, lng: coord }),
  z.object({ action: z.literal("miss"), stopId: z.string().min(1), note: z.string().trim().min(3, "Say why this stop was missed").max(300) }),
  z.object({ action: z.literal("complete") }),
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const a = parsed.data;
  const job = await load(params.id, auth.guardId);
  if (!job) return jsonError("Patrol not found", 404);

  if (a.action === "start") {
    if (job.status !== "SCHEDULED") return jsonError("This patrol has already been started.", 409);
    if (job.run.vehicle && !a.check) return jsonError("Complete the vehicle check before starting.", 400);
    await prisma.$transaction([
      prisma.patrolJob.update({ where: { id: job.id }, data: { status: "ACTIVE", startedAt: new Date() } }),
      ...(job.run.vehicle && a.check
        ? [
            prisma.vehicleCheck.create({
              data: { companyId: auth.companyId, vehicleId: job.run.vehicle.id, guardId: auth.guardId, odometer: a.check.odometer, fuel: a.check.fuel, failed: a.check.failed, notes: a.check.notes },
            }),
            ...(a.check.odometer ? [prisma.vehicle.update({ where: { id: job.run.vehicle.id }, data: { odometer: a.check.odometer } })] : []),
          ]
        : []),
    ]);
  } else if (a.action === "complete") {
    if (job.status !== "ACTIVE") return jsonError("This patrol isn't in progress.", 409);
    const pending = job.run.stops.filter((s) => !job.scans.some((x) => x.stopId === s.id));
    if (pending.length > 0) return jsonError(`${pending.length} stop${pending.length === 1 ? " is" : "s are"} still open. Scan them or mark them missed with a reason.`, 409);
    const scanned = job.scans.filter((s) => s.status === "SCANNED").length;
    await prisma.patrolJob.update({ where: { id: job.id }, data: { status: closedJobStatus(scanned, job.stopCount), completedAt: new Date() } });
  } else {
    if (job.status !== "ACTIVE") return jsonError("Start the patrol first.", 409);
    const stop = job.run.stops.find((s) => s.id === a.stopId);
    if (!stop) return jsonError("That stop isn't on this run.", 404);
    const fix = a.action === "scan" && a.lat !== undefined && a.lng !== undefined ? { lat: a.lat, lng: a.lng } : {};
    const data = { status: a.action === "scan" ? "SCANNED" : "MISSED", note: a.note || null, at: new Date(), ...fix };
    await prisma.patrolScan.upsert({
      where: { jobId_stopId: { jobId: job.id, stopId: stop.id } },
      update: data,
      create: { ...data, jobId: job.id, stopId: stop.id, stopName: stop.name },
    });
  }
  const fresh = await load(params.id, auth.guardId);
  return NextResponse.json(serialise(fresh as Job));
}
