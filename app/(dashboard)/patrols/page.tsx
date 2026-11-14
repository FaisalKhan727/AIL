"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CalendarPlus, FileText, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/fetcher";
import { fmtTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { money } from "@/lib/ops";
import { DataTable, Pill, ResourceDialog, Stat, StatusPill, Tabs, auDate, useAct, type Col } from "@/components/ops/kit";

interface Stop { id?: string; name: string; address: string | null; instructions: string | null }
interface Run {
  id: string; code: string; name: string; rate: string; active: boolean; clientId: string | null; vehicleId: string | null;
  client: { id: string; name: string } | null; vehicle: { id: string; code: string; rego: string } | null; stops: (Stop & { id: string })[]; _count: { jobs: number };
}
interface Scan { stopId: string; stopName: string; status: string; at: string; note: string | null; lat: number | null; lng: number | null }
interface Job {
  id: string; date: string; status: string; guardId: string | null; guardName: string | null; stopCount: number; rate: string; scanned: number; missed: number;
  billable: number; invoiceId: string | null; startedAt: string | null; completedAt: string | null;
  run: { code: string; name: string; stops: { id: string; name: string; address: string | null }[]; client: { name: string } | null; vehicle: { code: string; rego: string } | null };
  scans: Scan[];
}
interface JobsResp { jobs: Job[]; guards: { id: string; name: string }[] }

const today = () => new Date().toISOString().slice(0, 10);

export default function PatrolsPage() {
  const qc = useQueryClient();
  const act = useAct();
  const [tab, setTab] = React.useState<"jobs" | "runs">("jobs");
  const jobs = useQuery<JobsResp>({ queryKey: ["patrol-jobs"], queryFn: () => api(`/api/patrol-jobs`), refetchInterval: 10_000 });
  const runs = useQuery<Run[]>({ queryKey: ["patrol-runs"], queryFn: () => api(`/api/patrol-runs`) });
  const clients = useQuery<{ id: string; name: string }[]>({ queryKey: ["clients"], queryFn: () => api(`/api/clients`) });
  const vehicles = useQuery<{ id: string; code: string; rego: string }[]>({ queryKey: ["vehicles"], queryFn: () => api(`/api/vehicles`) });

  const [runOpen, setRunOpen] = React.useState(false);
  const [runEdit, setRunEdit] = React.useState<Run | undefined>();
  const [stops, setStops] = React.useState<Stop[]>([]);
  const [schedOpen, setSchedOpen] = React.useState(false);
  const [jobId, setJobId] = React.useState<string | null>(null);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["patrol-jobs"] }); qc.invalidateQueries({ queryKey: ["patrol-runs"] }); };
  const all = jobs.data?.jobs ?? [];
  const job = all.find((j) => j.id === jobId) ?? null;
  const todays = all.filter((j) => j.date.slice(0, 10) === today());

  function editRun(r?: Run) {
    setRunEdit(r);
    setStops(r ? r.stops.map((s) => ({ ...s })) : [{ name: "", address: "", instructions: "" }]);
    setRunOpen(true);
  }
  const setStop = (i: number, k: keyof Stop, v: string) => setStops((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, d: -1 | 1) => setStops((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const patchJob = (body: Record<string, unknown>, ok?: string) =>
    act(async () => { await api(`/api/patrol-jobs/${jobId}`, { method: "PATCH", body: JSON.stringify(body) }); await qc.invalidateQueries({ queryKey: ["patrol-jobs"] }); }, ok);

  const jCols: Col<Job>[] = [
    { h: "Date", c: (j) => <span className="num whitespace-nowrap text-[13px]">{auDate(j.date)}</span> },
    { h: "Run", c: (j) => <><span className="font-mono font-medium">{j.run.code}</span> <span className="text-muted-foreground">{j.run.name}</span></> },
    { h: "Client", c: (j) => j.run.client?.name ?? <span className="text-muted-foreground">—</span> },
    { h: "Guard", c: (j) => j.guardName ?? <Pill tone="amber">Unassigned</Pill> },
    { h: "Vehicle", c: (j) => (j.run.vehicle ? <span className="font-mono text-xs">{j.run.vehicle.code}</span> : "—") },
    { h: "Status", c: (j) => <StatusPill status={j.status} className={j.status === "ACTIVE" ? "[&]:animate-pulse" : undefined} /> },
    { h: "Stops", c: (j) => (
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full", j.missed ? "bg-warning" : "bg-success")} style={{ width: `${(j.scanned / Math.max(1, j.stopCount)) * 100}%` }} /></span>
        <span className="num text-xs">{j.scanned}/{j.stopCount}</span>
        {j.missed > 0 && <span className="num text-xs text-red-700">{j.missed} missed</span>}
      </span>
    ) },
    { h: "Billable", c: (j) => (j.status === "SCHEDULED" || j.status === "ACTIVE" ? <span className="text-muted-foreground">—</span> : <span className="num">{money(j.billable)}</span>), className: "text-right" },
    { h: "Invoiced", c: (j) => (j.invoiceId ? <Pill tone="green">Yes</Pill> : <span className="text-muted-foreground">—</span>) },
  ];
  const rCols: Col<Run>[] = [
    { h: "Run", c: (r) => <><span className="font-mono font-medium">{r.code}</span>{!r.active && <Pill tone="grey" className="ml-2">Inactive</Pill>}</> },
    { h: "Name / area", c: (r) => r.name },
    { h: "Client", c: (r) => r.client?.name ?? <span className="text-amber-700">No client: can&apos;t be invoiced</span> },
    { h: "Vehicle", c: (r) => (r.vehicle ? <span className="font-mono text-xs">{r.vehicle.code} · {r.vehicle.rego}</span> : "—") },
    { h: "Stops", c: (r) => <span className="num">{r.stops.length}</span> },
    { h: "Rate / run", c: (r) => <span className="num">{money(r.rate)}</span>, className: "text-right" },
    { h: "Jobs", c: (r) => <span className="num">{r._count.jobs}</span> },
    { h: "", c: (r) => (
      <span onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="ghost" className="px-2 text-red-700" aria-label="Delete run" onClick={async () => {
          if (!confirm(`Delete run ${r.code}?`)) return;
          if (await act(() => api(`/api/patrol-runs/${r.id}`, { method: "DELETE" }), "Run deleted")) refresh();
        }}><Trash2 className="h-3.5 w-3.5" /></Button>
      </span>
    ) },
  ];

  return (
    <>
      <PageHeader
        title="Patrol Runs"
        description="Vehicle patrol routes, who is driving them tonight, and how far through they are."
        actions={
          <>
            <Button variant="outline" onClick={() => editRun()}><Plus className="h-4 w-4" /> New run</Button>
            <Button disabled={!runs.data?.some((r) => r.active)} onClick={() => setSchedOpen(true)}><CalendarPlus className="h-4 w-4" /> Schedule job</Button>
          </>
        }
      />
      <p className="mb-4 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
        Patrol runs are billed to clients per completed run. They are separate from shifts and have no effect on timesheets or payroll.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In progress" value={all.filter((j) => j.status === "ACTIVE").length} tone="text-cyan" />
        <Stat label="Scheduled today" value={todays.length} sub={`${todays.filter((j) => j.status === "COMPLETED").length} completed`} />
        <Stat label="Missed stops (14 days)" value={all.reduce((n, j) => n + j.missed, 0)} />
        <Stat label="Uninvoiced work" value={money(all.filter((j) => !j.invoiceId).reduce((n, j) => n + j.billable, 0))} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "jobs", label: "Jobs", count: all.length }, { key: "runs", label: "Runs", count: runs.data?.length }]} />
      {tab === "jobs" && <DataTable cols={jCols} rows={all} onRow={(j) => setJobId(j.id)} empty="Nothing scheduled in the last or next two weeks. Create a run, then schedule a job for it." />}
      {tab === "runs" && <DataTable cols={rCols} rows={runs.data ?? []} onRow={editRun} empty="No patrol runs yet." />}

      <ResourceDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        title={runEdit ? `Edit run ${runEdit.code}` : "New patrol run"}
        endpoint="/api/patrol-runs"
        initial={runEdit as unknown as Record<string, unknown> | undefined}
        extraPayload={() => ({ stops: stops.filter((s) => s.name.trim()) })}
        onSaved={refresh}
        fields={[
          { name: "code", label: "Run number", required: true, half: true, placeholder: "R01" },
          { name: "rate", label: "Rate per completed run ($)", type: "number", step: "0.01", required: true, half: true },
          { name: "name", label: "Name / area", required: true, placeholder: "CBD Night Patrol Run A" },
          { name: "clientId", label: "Billed to", type: "select", half: true, options: (clients.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
          { name: "vehicleId", label: "Vehicle", type: "select", half: true, options: (vehicles.data ?? []).map((v) => ({ value: v.id, label: `${v.code} · ${v.rego}` })) },
          { name: "active", label: "Active", type: "checkbox" },
        ]}
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between"><span className="label">Stops, in driving order</span><span className="num text-xs text-muted-foreground">{stops.filter((s) => s.name.trim()).length} stops</span></div>
          <ol className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {stops.map((s, i) => (
              <li key={s.id ?? `new-${i}`} className="grid grid-cols-[1.5rem_1fr_auto] items-start gap-2">
                <span className="num pt-2.5 text-right text-xs text-muted-foreground">{i + 1}</span>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <Input placeholder="Stop name" value={s.name} onChange={(e) => setStop(i, "name", e.target.value)} />
                  <Input placeholder="Address" value={s.address ?? ""} onChange={(e) => setStop(i, "address", e.target.value)} />
                  <Input className="sm:col-span-2" placeholder="Instructions (optional): check roller door, photo of gate…" value={s.instructions ?? ""} onChange={(e) => setStop(i, "instructions", e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5" aria-label="Move down" disabled={i === stops.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-red-700" aria-label="Remove stop" onClick={() => setStops((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </li>
            ))}
          </ol>
          <Button type="button" size="sm" variant="outline" onClick={() => setStops((s) => [...s, { name: "", address: "", instructions: "" }])}><Plus className="h-3.5 w-3.5" /> Add stop</Button>
        </div>
      </ResourceDialog>

      <ResourceDialog
        open={schedOpen}
        onOpenChange={setSchedOpen}
        title="Schedule patrol job"
        description="The guard sees it in their app on the day."
        endpoint="/api/patrol-jobs"
        initial={{ date: today() }}
        onSaved={refresh}
        fields={[
          { name: "runId", label: "Run", type: "select", required: true, options: (runs.data ?? []).filter((r) => r.active).map((r) => ({ value: r.id, label: `${r.code} — ${r.name} (${r.stops.length} stops)` })) },
          { name: "date", label: "Date", type: "date", required: true, half: true },
          { name: "guardId", label: "Guard", type: "select", half: true, options: (jobs.data?.guards ?? []).map((g) => ({ value: g.id, label: g.name })) },
        ]}
      />

      <Dialog open={Boolean(job)} onOpenChange={(v) => { if (!v) setJobId(null); }}>
        <DialogContent className="sm:!max-w-2xl">
          {job && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2"><span className="font-mono">{job.run.code}</span> {job.run.name} <StatusPill status={job.status} /></DialogTitle>
                <DialogDescription>
                  {auDate(job.date)} · {job.run.client?.name ?? "No client"} · {job.run.vehicle ? `${job.run.vehicle.code} (${job.run.vehicle.rego})` : "no vehicle"}
                  {job.startedAt ? ` · started ${fmtTime(job.startedAt)}` : ""}{job.completedAt ? ` · closed ${fmtTime(job.completedAt)}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1 space-y-1">
                  <div className="eyebrow">Guard</div>
                  <Select value={job.guardId ?? ""} disabled={Boolean(job.invoiceId)} onChange={(e) => patchJob({ guardId: e.target.value || null }, "Guard updated")}>
                    <option value="">Unassigned</option>
                    {(jobs.data?.guards ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                </div>
                <Button asChild variant="outline"><Link href={`/patrols/runsheet/${job.id}`} target="_blank"><FileText className="h-4 w-4" /> Runsheet</Link></Button>
                {job.status === "ACTIVE" && <Button variant="outline" onClick={() => { if (confirm("Close this job now? Stops not scanned count as not done.")) patchJob({ action: "close" }, "Job closed"); }}>Close job</Button>}
                {["COMPLETED", "PARTIAL", "MISSED"].includes(job.status) && !job.invoiceId && <Button variant="outline" onClick={() => patchJob({ action: "reopen" }, "Job reopened")}>Reopen</Button>}
                {job.status === "SCHEDULED" && <Button variant="outline" className="text-red-700" onClick={async () => {
                  if (!confirm("Remove this scheduled job?")) return;
                  if (await act(() => api(`/api/patrol-jobs/${job.id}`, { method: "DELETE" }), "Job removed")) { setJobId(null); refresh(); }
                }}>Remove</Button>}
              </div>
              <ol className="max-h-[22rem] divide-y overflow-y-auto rounded-md border">
                {job.run.stops.map((s, i) => {
                  const scan = job.scans.find((x) => x.stopId === s.id);
                  return (
                    <li key={s.id} className="grid grid-cols-[1.5rem_1fr_auto] items-start gap-2 px-3 py-2 text-sm">
                      <span className="num text-xs text-muted-foreground">{i + 1}</span>
                      <span>
                        <span className="font-medium">{s.name}</span>
                        {s.address && <span className="block text-xs text-muted-foreground">{s.address}</span>}
                        {scan?.note && <span className="block text-xs text-amber-700">{scan.note}</span>}
                      </span>
                      <span className="text-right">
                        <StatusPill status={scan?.status === "SCANNED" ? "COMPLETED" : scan?.status ?? "SCHEDULED"} />
                        {scan && <span className="num mt-0.5 block text-xs text-muted-foreground">{fmtTime(scan.at)}{scan.lat !== null ? " · GPS" : ""}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{job.scanned} of {job.stopCount} stops attended{job.missed ? `, ${job.missed} missed` : ""}</span>
                <span>Billable: <span className="num font-medium">{money(job.billable)}</span> <span className="text-muted-foreground">of {money(job.rate)}</span></span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
