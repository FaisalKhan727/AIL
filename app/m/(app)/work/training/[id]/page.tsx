"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ArrowLeft, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { auDate, useAct } from "@/components/ops/kit";

interface Resp {
  status: string; score: number | null; attempts: number; completedAt: string | null; expiresAt: string | null;
  course: { title: string; category: string; description: string | null; content: string; passMark: number; questions: { q: string; options: string[] }[] };
}

export default function GuardTraining() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const act = useAct();
  const { data, isLoading } = useQuery<Resp>({ queryKey: ["m-training", id], queryFn: () => api(`/api/m/training/${id}`) });
  const [stage, setStage] = React.useState<"read" | "quiz">("read");
  const [answers, setAnswers] = React.useState<number[]>([]);
  const [result, setResult] = React.useState<{ passed: boolean; score: number; passMark: number } | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!data) return <p className="text-muted-foreground">Course not found.</p>;
  const c = data.course;
  const qs = c.questions;

  async function submit(a: number[]) {
    setBusy(true);
    await act(async () => {
      const r = await api<{ passed: boolean; score: number; passMark: number }>(`/api/m/training/${id}`, { method: "POST", body: JSON.stringify({ answers: a }) });
      setResult(r);
      await Promise.all([qc.invalidateQueries({ queryKey: ["m-training", id] }), qc.invalidateQueries({ queryKey: ["m-work"] })]);
    });
    setBusy(false);
  }

  const back = <Link href="/m/work" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Tasks</Link>;

  if (data.status === "PASSED") {
    return (
      <div className="space-y-4">
        {back}
        <section className="rounded-[10px] border border-success/50 bg-success/[0.07] p-5 text-center">
          <Award className="mx-auto h-10 w-10 text-success" />
          <div className="eyebrow mt-3 !text-success">Certificate of completion</div>
          <h1 className="mt-1 font-display text-xl font-extrabold">{c.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Passed with <span className="num text-foreground">{data.score}%</span> on {auDate(data.completedAt)}
            {data.expiresAt ? <>. Renew by <span className="num text-foreground">{auDate(data.expiresAt)}</span>.</> : "."}
          </p>
        </section>
        <details className="rounded-[10px] border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">Review the course material</summary>
          <div className="mt-3 whitespace-pre-wrap leading-relaxed text-muted-foreground">{c.content}</div>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {back}
      <div>
        <div className="eyebrow">{c.category}</div>
        <h1 className="mt-1 font-display text-xl font-extrabold leading-tight">{c.title}</h1>
        {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
      </div>

      {result && !result.passed && (
        <div className="notice-danger rounded-[10px] border p-3 text-sm">
          You scored <span className="num font-semibold">{result.score}%</span>. The pass mark is {result.passMark}%. Read the material again and retry.
        </div>
      )}

      {stage === "read" && (
        <>
          <article className="whitespace-pre-wrap rounded-[10px] border bg-card p-4 text-[15px] leading-relaxed">{c.content}</article>
          <Button className="h-12 w-full text-base" disabled={busy} onClick={() => { if (qs.length === 0) submit([]); else { setAnswers(Array(qs.length).fill(-1)); setResult(null); setStage("quiz"); } }}>
            {qs.length === 0 ? (busy ? "Saving…" : "I have read and understood this") : `Start the quiz (${qs.length} questions, pass ${c.passMark}%)`}
          </Button>
        </>
      )}

      {stage === "quiz" && (
        <form onSubmit={async (e) => { e.preventDefault(); await submit(answers); setStage("read"); window.scrollTo(0, 0); }} className="space-y-4">
          {qs.map((q, i) => (
            <fieldset key={i} className="rounded-[10px] border bg-card p-4">
              <legend className="px-1 text-sm font-medium"><span className="num text-muted-foreground">{i + 1}.</span> {q.q}</legend>
              <div className="mt-2 space-y-1.5">
                {q.options.map((o, k) => (
                  <label key={k} className={cn("flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm", answers[i] === k ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/40")}>
                    <input type="radio" className="mt-0.5" name={`q${i}`} checked={answers[i] === k} onChange={() => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))} />
                    {o}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={() => setStage("read")}>Back to material</Button>
            <Button type="submit" className="h-12 text-base" disabled={busy || answers.some((a) => a < 0)}>{busy ? "Marking…" : "Submit answers"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
