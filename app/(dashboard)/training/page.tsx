"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { COURSE_CATEGORIES, type QuizQuestion } from "@/lib/ops";
import { DataTable, MultiPick, Pill, ResourceDialog, Stat, StatusPill, Tabs, auDate, useAct, type Col } from "@/components/ops/kit";

interface Course {
  id: string; title: string; category: string; description: string | null; content: string; mandatory: boolean; renewalMonths: number | null;
  passMark: number; questions: QuizQuestion[]; active: boolean; enrollments: { status: string }[];
}
interface Enrollment {
  id: string; guardName: string | null; status: string; score: number | null; attempts: number; dueAt: string | null; completedAt: string | null; expiresAt: string | null;
  course: { title: string; mandatory: boolean; passMark: number };
}
interface EnrollResp { enrollments: Enrollment[]; guards: { id: string; name: string }[] }

const blankQ = (): QuizQuestion => ({ q: "", options: ["", ""], answer: 0 });

export default function TrainingPage() {
  const qc = useQueryClient();
  const act = useAct();
  const [tab, setTab] = React.useState<"courses" | "records">("courses");
  const courses = useQuery<Course[]>({ queryKey: ["courses"], queryFn: () => api(`/api/courses`) });
  const records = useQuery<EnrollResp>({ queryKey: ["enrollments"], queryFn: () => api(`/api/enrollments`), refetchInterval: 20_000 });
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Course | undefined>();
  const [questions, setQuestions] = React.useState<QuizQuestion[]>([]);
  const [assignFor, setAssignFor] = React.useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["courses"] }); qc.invalidateQueries({ queryKey: ["enrollments"] }); };

  function edit(c?: Course) {
    setEditing(c);
    setQuestions(c ? c.questions.map((q) => ({ ...q, options: [...q.options] })) : []);
    setOpen(true);
  }
  const setQ = (i: number, patch: Partial<QuizQuestion>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const all = courses.data ?? [];
  const enr = records.data?.enrollments ?? [];
  const now = Date.now();
  const overdue = enr.filter((e) => e.status !== "PASSED" && e.dueAt && +new Date(e.dueAt) < now);
  const scores = enr.filter((e) => e.status === "PASSED" && e.score !== null).map((e) => e.score as number);

  const cCols: Col<Course>[] = [
    { h: "Course", c: (c) => <><span className="font-medium">{c.title}</span>{!c.active && <Pill tone="grey" className="ml-2">Archived</Pill>}{c.description && <div className="max-w-md truncate text-xs text-muted-foreground">{c.description}</div>}</> },
    { h: "Category", c: (c) => <span className="text-xs text-muted-foreground">{c.category}</span> },
    { h: "Required", c: (c) => (c.mandatory ? <Pill tone="amber">Mandatory</Pill> : <Pill tone="grey">Optional</Pill>) },
    { h: "Quiz", c: (c) => (c.questions.length ? <span className="num text-xs">{c.questions.length} q · pass {c.passMark}%</span> : <span className="text-xs text-muted-foreground">Read only</span>) },
    { h: "Renewal", c: (c) => (c.renewalMonths ? `${c.renewalMonths} months` : <span className="text-muted-foreground">Never</span>) },
    { h: "Completion", c: (c) => { const done = c.enrollments.filter((e) => e.status === "PASSED").length; return c.enrollments.length ? <span className="num">{done}/{c.enrollments.length} <span className="text-muted-foreground">({Math.round((done / c.enrollments.length) * 100)}%)</span></span> : <span className="text-muted-foreground">Not assigned</span>; } },
    { h: "", className: "text-right", c: (c) => (
      <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="outline" onClick={() => setAssignFor(c.id)}><UserPlus className="h-3.5 w-3.5" /> Assign</Button>
        <Button size="sm" variant="ghost" className="px-2 text-red-700" aria-label="Delete course" onClick={async () => {
          if (!confirm(`Delete "${c.title}" and every guard's record for it? Archive it instead to keep the records.`)) return;
          if (await act(() => api(`/api/courses/${c.id}`, { method: "DELETE" }), "Course deleted")) refresh();
        }}><Trash2 className="h-3.5 w-3.5" /></Button>
      </span>
    ) },
  ];
  const rCols: Col<Enrollment>[] = [
    { h: "Guard", c: (e) => <span className="font-medium">{e.guardName ?? "Removed guard"}</span> },
    { h: "Course", c: (e) => <>{e.course.title}{e.course.mandatory && <Pill tone="amber" className="ml-2">Mandatory</Pill>}</> },
    { h: "Status", c: (e) => <StatusPill status={e.status} /> },
    { h: "Score", c: (e) => (e.score === null ? "—" : <span className="num">{e.score}%</span>) },
    { h: "Attempts", c: (e) => <span className="num">{e.attempts}</span> },
    { h: "Due", c: (e) => <span className={e.status !== "PASSED" && e.dueAt && +new Date(e.dueAt) < now ? "text-red-700" : ""}>{auDate(e.dueAt)}</span> },
    { h: "Completed", c: (e) => auDate(e.completedAt) },
    { h: "Certificate expires", c: (e) => (e.status === "PASSED" ? (e.expiresAt ? <span className={+new Date(e.expiresAt) < now ? "text-red-700" : ""}>{auDate(e.expiresAt)}</span> : "No expiry") : "—") },
    { h: "", c: (e) => e.status !== "PASSED" && (
      <Button size="sm" variant="ghost" className="px-2 text-red-700" aria-label="Unassign" onClick={async () => {
        if (await act(() => api(`/api/enrollments/${e.id}`, { method: "DELETE" }), "Unassigned")) refresh();
      }}><Trash2 className="h-3.5 w-3.5" /></Button>
    ) },
  ];

  return (
    <>
      <PageHeader title="Training & Certification" description="Write courses, assign them to guards, and see who has passed. Guards complete them in the app."
        actions={<Button onClick={() => edit()}><Plus className="h-4 w-4" /> New course</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active courses" value={all.filter((c) => c.active).length} />
        <Stat label="Assignments open" value={enr.filter((e) => e.status !== "PASSED").length} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "text-warning" : undefined} />
        <Stat label="Average pass score" value={scores.length ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%` : "—"} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "courses", label: "Courses", count: all.length }, { key: "records", label: "Training records", count: enr.length }]} />
      {tab === "courses" && <DataTable cols={cCols} rows={all} onRow={edit} empty="No courses yet. Create one and assign it to your guards." />}
      {tab === "records" && <DataTable cols={rCols} rows={enr} empty="Nothing assigned yet." />}

      <ResourceDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit course" : "New course"}
        endpoint="/api/courses"
        initial={editing as unknown as Record<string, unknown> | undefined}
        extraPayload={() => ({ questions: questions.filter((q) => q.q.trim()).map((q) => ({ ...q, options: q.options.filter((o) => o.trim()) })) })}
        onSaved={refresh}
        fields={[
          { name: "title", label: "Title", required: true },
          { name: "category", label: "Category", type: "select", required: true, options: COURSE_CATEGORIES.map((c) => ({ value: c, label: c })) },
          { name: "description", label: "One-line summary" },
          { name: "content", label: "Course material", type: "textarea", required: true, hint: "Plain text. Blank lines start a new paragraph." },
          { name: "passMark", label: "Pass mark (%)", type: "number", half: true },
          { name: "renewalMonths", label: "Renew every (months)", type: "number", half: true, clearable: true, hint: "Leave blank if it never expires" },
          { name: "mandatory", label: "Mandatory for assigned guards", type: "checkbox" },
          { name: "active", label: "Active", type: "checkbox" },
        ]}
      >
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-baseline justify-between"><span className="label">Quiz questions</span><span className="text-xs text-muted-foreground">Select the correct answer for each</span></div>
          {questions.length === 0 && <p className="text-xs text-muted-foreground">No quiz: guards pass by reading the material and confirming.</p>}
          <ol className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {questions.map((q, i) => (
              <li key={i} className="rounded-md border bg-background/40 p-2.5">
                <div className="flex gap-2">
                  <span className="num pt-2 text-xs text-muted-foreground">{i + 1}</span>
                  <Input placeholder="Question" value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} />
                  <Button type="button" variant="ghost" className="px-2 text-red-700" aria-label="Remove question" onClick={() => setQuestions((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="mt-2 space-y-1.5 pl-5">
                  {q.options.map((o, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <input type="radio" name={`q${i}`} aria-label={`Option ${k + 1} is correct`} checked={q.answer === k} onChange={() => setQ(i, { answer: k })} />
                      <Input className="h-8" placeholder={`Option ${k + 1}`} value={o} onChange={(e) => setQ(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} />
                      {q.options.length > 2 && <button type="button" className="text-xs text-muted-foreground hover:text-red-700" onClick={() => setQ(i, { options: q.options.filter((_, m) => m !== k), answer: q.answer >= k && q.answer > 0 ? q.answer - 1 : q.answer })}>remove</button>}
                    </div>
                  ))}
                  {q.options.length < 6 && <button type="button" className="text-xs text-cyan hover:underline" onClick={() => setQ(i, { options: [...q.options, ""] })}>+ option</button>}
                </div>
              </li>
            ))}
          </ol>
          <Button type="button" size="sm" variant="outline" onClick={() => setQuestions((q) => [...q, blankQ()])}><Plus className="h-3.5 w-3.5" /> Add question</Button>
        </div>
      </ResourceDialog>

      <AssignDialog courseId={assignFor} courses={all} guards={records.data?.guards ?? []} onClose={() => setAssignFor(null)} onDone={refresh} />
    </>
  );
}

function AssignDialog({ courseId, courses, guards, onClose, onDone }: { courseId: string | null; courses: Course[]; guards: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [due, setDue] = React.useState("");
  const [sms, setSms] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setPicked(new Set()); setDue(""); setSms(false); setBusy(false); }, [courseId]);
  const course = courses.find((c) => c.id === courseId);
  if (!course) return null;

  async function submit() {
    setBusy(true);
    try {
      const r = await api<{ assigned: number; alreadyHad: number; texted: number }>(`/api/enrollments`, { method: "POST", body: JSON.stringify({ courseId, guardIds: Array.from(picked), dueAt: due, sms }) });
      toast({
        title: "Course assigned",
        description: `${r.assigned} assigned${r.alreadyHad ? `, ${r.alreadyHad} already had it` : ""}${sms ? `, ${r.texted} texted` : ""}`,
        variant: "success",
      });
      onDone();
      onClose();
    } catch (e) {
      toast({ title: "Couldn't assign", description: e instanceof Error ? e.message : "", variant: "error" });
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign course</DialogTitle><DialogDescription>{course.title}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2 text-xs">
            <button type="button" className="text-cyan hover:underline" onClick={() => setPicked(new Set(guards.map((g) => g.id)))}>Select all</button>
            <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
          <MultiPick label="Guards" options={guards} value={picked} onChange={setPicked} />
          <div className="space-y-1"><Label htmlFor="due">Complete by (optional)</Label><Input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> Text each guard that it has been assigned</label>
        </div>
        <DialogFooter className="dialog-footer-sticky">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={picked.size === 0 || busy} onClick={submit}>{busy ? "Assigning…" : `Assign to ${picked.size}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
