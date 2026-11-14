import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireGuard } from "@/lib/api";
import { parseQuestions, scoreQuiz } from "@/lib/ops";

const load = (id: string, guardId: string) => prisma.enrollment.findFirst({ where: { id, guardId }, include: { course: true } });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const e = await load(params.id, auth.guardId);
  if (!e) return jsonError("Course not found", 404);
  return NextResponse.json({
    id: e.id,
    status: e.status,
    score: e.score,
    attempts: e.attempts,
    completedAt: e.completedAt,
    expiresAt: e.expiresAt,
    dueAt: e.dueAt,
    course: {
      title: e.course.title,
      category: e.course.category,
      description: e.course.description,
      content: e.course.content,
      passMark: e.course.passMark,
      // Correct answers never leave the server.
      questions: parseQuestions(e.course.questions).map((q) => ({ q: q.q, options: q.options })),
    },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const parsed = z.object({ answers: z.array(z.number().int().min(-1).max(10)).max(60) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation", 400);
  const e = await load(params.id, auth.guardId);
  if (!e) return jsonError("Course not found", 404);
  if (e.status === "PASSED") return jsonError("You have already passed this course.", 409);

  const questions = parseQuestions(e.course.questions);
  if (parsed.data.answers.length !== questions.length) return jsonError("Answer every question before submitting.", 400);
  const score = scoreQuiz(questions, parsed.data.answers);
  const passed = score >= e.course.passMark;
  const now = new Date();
  const expiresAt = passed && e.course.renewalMonths ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + e.course.renewalMonths, now.getUTCDate())) : null;
  await prisma.enrollment.update({
    where: { id: e.id },
    data: { status: passed ? "PASSED" : "FAILED", score, attempts: { increment: 1 }, completedAt: passed ? now : null, expiresAt },
  });
  return NextResponse.json({ passed, score, passMark: e.course.passMark });
}
