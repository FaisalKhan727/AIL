import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { PRIORITIES, refLabel } from "@/lib/ops";
import { actorName } from "@/lib/server/crud";
import { trySms } from "@/lib/server/ops";
import { phoneE164 } from "@/lib/validators";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dispatch"), guardId: z.string().min(1), etaMins: z.coerce.number().int().min(1).max(240), note: z.string().trim().max(300).optional(), sms: z.boolean().optional() }),
  z.object({ action: z.literal("recall") }),
  z.object({ action: z.literal("on-scene") }),
  z.object({ action: z.literal("verify"), verification: z.enum(["UNVERIFIED", "CCTV_CONFIRMED", "GUARD_CONFIRMED"]) }),
  z.object({ action: z.literal("escalate") }),
  z.object({ action: z.literal("note"), text: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal("sop"), index: z.number().int().min(0).max(30), done: z.boolean(), label: z.string().max(200) }),
  z.object({ action: z.literal("false-alarm"), outcome: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("resolve"), outcome: z.string().trim().min(3, "Describe the outcome").max(500) }),
  z.object({ action: z.literal("sms"), name: z.string().trim().min(1).max(60), phone: phoneE164, body: z.string().trim().min(1).max(480) }),
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const a = parsed.data;

  const alarm = await prisma.alarm.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!alarm) return jsonError("not found", 404);
  if (alarm.status === "RESOLVED" && a.action !== "note") return jsonError("This alarm is already resolved.", 409);

  const actor = actorName(auth);
  const now = new Date();
  const ref = refLabel("ALM", alarm.ref);
  const log = (text: string) => prisma.alarmEvent.create({ data: { alarmId: alarm.id, actor, text } });
  let smsSent: boolean | undefined;

  switch (a.action) {
    case "dispatch": {
      const [guard, site] = await Promise.all([
        prisma.guard.findFirst({ where: { id: a.guardId, companyId: auth.companyId, active: true } }),
        prisma.site.findUnique({ where: { id: alarm.siteId } }),
      ]);
      if (!guard) return jsonError("guard not found", 404);
      await prisma.alarm.update({
        where: { id: alarm.id },
        data: { status: "DISPATCHED", guardId: guard.id, etaMins: a.etaMins, dispatchedAt: now, onSceneAt: null },
      });
      if (a.sms !== false) {
        smsSent = await trySms(
          guard.phone,
          `VIGILO DISPATCH — ${alarm.type} at ${site?.name ?? "site"}${alarm.zone ? `, ${alarm.zone}` : ""}. Respond immediately. ETA target: ${a.etaMins} mins. Ref ${ref}. Open the Vigilo app to acknowledge.`,
          guard.id,
        );
      }
      await log(`Dispatched ${guard.firstName} ${guard.lastName}, ETA ${a.etaMins} min${a.sms === false ? "" : smsSent ? " (SMS sent)" : " (SMS FAILED)"}${a.note ? ` — ${a.note}` : ""}`);
      break;
    }
    case "recall":
      if (!alarm.guardId) return jsonError("No guard is dispatched.", 409);
      await prisma.alarm.update({ where: { id: alarm.id }, data: { status: "UNASSIGNED", guardId: null, etaMins: null, dispatchedAt: null, onSceneAt: null } });
      await log("Guard recalled");
      break;
    case "on-scene":
      if (!alarm.guardId) return jsonError("Dispatch a guard first.", 409);
      await prisma.alarm.update({ where: { id: alarm.id }, data: { status: "ON_SCENE", onSceneAt: alarm.onSceneAt ?? now } });
      await log("Guard on scene (set by operator)");
      break;
    case "verify":
      await prisma.alarm.update({ where: { id: alarm.id }, data: { verification: a.verification } });
      await log(`Verification: ${a.verification.replace("_", " ").toLowerCase()}`);
      break;
    case "escalate": {
      const i = PRIORITIES.indexOf(alarm.priority as (typeof PRIORITIES)[number]);
      if (i <= 0) return jsonError("Already at the highest priority.", 409);
      await prisma.alarm.update({ where: { id: alarm.id }, data: { priority: PRIORITIES[i - 1] } });
      await log(`Escalated ${alarm.priority} → ${PRIORITIES[i - 1]}`);
      break;
    }
    case "note":
      await log(a.text);
      break;
    case "sop": {
      const done = new Set(Array.isArray(alarm.sopDone) ? (alarm.sopDone as number[]) : []);
      if (a.done) done.add(a.index); else done.delete(a.index);
      await prisma.alarm.update({ where: { id: alarm.id }, data: { sopDone: Array.from(done).sort((x, y) => x - y) } });
      await log(`SOP ${a.done ? "done" : "unticked"}: ${a.label}`);
      break;
    }
    case "false-alarm":
      await prisma.alarm.update({
        where: { id: alarm.id },
        data: { status: "RESOLVED", verification: "FALSE_ALARM", resolvedAt: now, resolvedBy: actor, outcome: a.outcome || "False alarm" },
      });
      await log(`Marked false alarm${a.outcome ? ` — ${a.outcome}` : ""}`);
      break;
    case "resolve":
      await prisma.alarm.update({ where: { id: alarm.id }, data: { status: "RESOLVED", resolvedAt: now, resolvedBy: actor, outcome: a.outcome } });
      await log(`Resolved — ${a.outcome}`);
      break;
    case "sms":
      smsSent = await trySms(a.phone, a.body);
      await log(`SMS to ${a.name} (${a.phone}) ${smsSent ? "sent" : "FAILED"}: ${a.body}`);
      if (!smsSent) return jsonError("The SMS could not be sent. Check the SMS gateway in Settings.", 502);
      break;
  }
  return NextResponse.json({ ok: true, smsSent });
}
