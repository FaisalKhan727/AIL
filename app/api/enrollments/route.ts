import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { zOptDate } from "@/lib/server/crud";
import { lookups, trySms } from "@/lib/server/ops";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const [rows, look] = await Promise.all([
    prisma.enrollment.findMany({ where: { companyId: auth.companyId }, include: { course: { select: { title: true, mandatory: true, passMark: true } } }, orderBy: { createdAt: "desc" } }),
    lookups(auth.companyId),
  ]);
  return NextResponse.json({
    enrollments: rows.map((e) => ({ ...e, guardName: look.guardName(e.guardId) })),
    guards: look.guards.filter((g) => g.active).map((g) => ({ id: g.id, name: g.name })),
  });
}

const schema = z.object({ courseId: z.string().min(1), guardIds: z.array(z.string()).min(1).max(500), dueAt: zOptDate, sms: z.boolean().optional() });

// Assign a course to guards. Guards who already have it are left untouched.
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const d = parsed.data;
  const [course, guards, existing] = await Promise.all([
    prisma.course.findFirst({ where: { id: d.courseId, companyId: auth.companyId } }),
    prisma.guard.findMany({ where: { id: { in: d.guardIds }, companyId: auth.companyId, active: true } }),
    prisma.enrollment.findMany({ where: { courseId: d.courseId, guardId: { in: d.guardIds } }, select: { guardId: true } }),
  ]);
  if (!course) return jsonError("course not found", 404);
  const have = new Set(existing.map((e) => e.guardId));
  const fresh = guards.filter((g) => !have.has(g.id));
  await prisma.enrollment.createMany({
    data: fresh.map((g) => ({ companyId: auth.companyId, courseId: course.id, guardId: g.id, dueAt: d.dueAt ?? null })),
  });
  let texted = 0;
  if (d.sms) {
    const by = d.dueAt ? ` Complete by ${d.dueAt.toISOString().slice(0, 10).split("-").reverse().join("/")}.` : "";
    for (const g of fresh) {
      if (await trySms(g.phone, `Hi ${g.firstName}, you've been assigned training: ${course.title}.${by} Open the Vigilo app to begin.`, g.id)) texted++;
    }
  }
  return NextResponse.json({ assigned: fresh.length, alreadyHad: guards.length - fresh.length, texted }, { status: 201 });
}
