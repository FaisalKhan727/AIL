"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ImageIcon, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";
import { INCIDENT_STATUSES, INCIDENT_TYPES, PRIORITIES, money, refLabel } from "@/lib/ops";
import { downloadCsv } from "@/lib/csv-client";
import { DataTable, ResourceDialog, StatusPill, Tabs, useAct, type Col } from "@/components/ops/kit";

interface Incident {
  id: string; ref: number; siteName: string; guardName: string | null; type: string; severity: string; status: string; zone: string | null;
  narrative: string; persons: string | null; lossValue: string | null; assignedTo: string | null; notifyClient: boolean; occurredAt: string;
  hasPhoto: boolean; alarm: { ref: number } | null; updates: { id: string; at: string; actor: string; text: string }[];
}
interface Resp { incidents: Incident[]; sites: { id: string; name: string }[]; guards: { id: string; name: string }[]; alarms: { id: string; ref: number; label: string }[] }

type Filter = "ALL" | (typeof INCIDENT_STATUSES)[number];

export default function IncidentsPage() {
  const qc = useQueryClient();
  const act = useAct();
  const { data, isLoading } = useQuery<Resp>({ queryKey: ["incidents"], queryFn: () => api(`/api/incidents`), refetchInterval: 15_000 });
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [q, setQ] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [update, setUpdate] = React.useState("");
  const [assignee, setAssignee] = React.useState("");

  const all = data?.incidents ?? [];
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (i) => (filter === "ALL" || i.status === filter) &&
      (!needle || `${i.siteName} ${i.type} ${i.guardName ?? ""} ${refLabel("INC", i.ref)} ${i.narrative}`.toLowerCase().includes(needle)),
  );
  const current = all.find((i) => i.id === openId) ?? null;
  React.useEffect(() => { setUpdate(""); setAssignee(current?.assignedTo ?? ""); }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (body: Record<string, unknown>, ok?: string) =>
    act(async () => { await api(`/api/incidents/${openId}`, { method: "PATCH", body: JSON.stringify(body) }); await qc.invalidateQueries({ queryKey: ["incidents"] }); }, ok);

  const cols: Col<Incident>[] = [
    { h: "ID", c: (i) => <span className="font-mono text-xs">{refLabel("INC", i.ref)}</span> },
    { h: "When", c: (i) => <span className="whitespace-nowrap text-xs">{fmtDateTime(i.occurredAt)}</span> },
    { h: "Site", c: (i) => <>{i.siteName}{i.zone ? <span className="text-muted-foreground"> · {i.zone}</span> : null}</> },
    { h: "Type", c: (i) => <>{i.type}{i.hasPhoto && <ImageIcon className="ml-1.5 inline h-3 w-3 text-muted-foreground" aria-label="Photo attached" />}</> },
    { h: "Severity", c: (i) => <StatusPill status={i.severity} /> },
    { h: "Reported by", c: (i) => i.guardName ?? <span className="text-muted-foreground">Office</span> },
    { h: "Assigned", c: (i) => i.assignedTo ?? <span className="text-muted-foreground">—</span> },
    { h: "Alarm", c: (i) => (i.alarm ? <span className="font-mono text-xs">{refLabel("ALM", i.alarm.ref)}</span> : <span className="text-muted-foreground">—</span>) },
    { h: "Status", c: (i) => <StatusPill status={i.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Incident Reports"
        description="Reports filed by guards in the field and by the office, with a full timeline for each."
        actions={
          <>
            <Button variant="outline" disabled={rows.length === 0} onClick={() => downloadCsv(`incidents-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((i) => ({
              ID: refLabel("INC", i.ref), Occurred: i.occurredAt, Site: i.siteName, Zone: i.zone ?? "", Type: i.type, Severity: i.severity, Status: i.status,
              "Reported by": i.guardName ?? "Office", "Assigned to": i.assignedTo ?? "", "Loss value": i.lossValue ?? "", Narrative: i.narrative,
            })))}><Download className="h-4 w-4" /> Export CSV</Button>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New incident</Button>
          </>
        }
      />
      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[{ key: "ALL" as Filter, label: "All", count: all.length }, ...INCIDENT_STATUSES.map((s) => ({ key: s as Filter, label: s.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()), count: all.filter((i) => i.status === s).length }))]}
      />
      <Input className="mb-3 max-w-md" placeholder="Search site, type, guard or narrative" value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : <DataTable cols={cols} rows={rows} onRow={(i) => setOpenId(i.id)} empty={all.length ? "No incidents match." : "No incidents reported yet. Guards can file them from the app."} />}

      <ResourceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New incident"
        endpoint="/api/incidents"
        onSaved={() => { qc.invalidateQueries({ queryKey: ["incidents"] }); }}
        fields={[
          { name: "siteId", label: "Site", type: "select", required: true, half: true, options: (data?.sites ?? []).map((s) => ({ value: s.id, label: s.name })) },
          { name: "zone", label: "Zone / location", half: true },
          { name: "type", label: "Type", type: "select", required: true, half: true, options: INCIDENT_TYPES.map((t) => ({ value: t, label: t })) },
          { name: "severity", label: "Severity", type: "select", required: true, half: true, options: PRIORITIES.map((p) => ({ value: p, label: p })) },
          { name: "guardId", label: "Reporting guard", type: "select", half: true, options: (data?.guards ?? []).map((g) => ({ value: g.id, label: g.name })) },
          { name: "alarmId", label: "Linked alarm", type: "select", half: true, options: (data?.alarms ?? []).map((a) => ({ value: a.id, label: `${refLabel("ALM", a.ref)} ${a.label}` })) },
          { name: "narrative", label: "What happened", type: "textarea", required: true },
          { name: "persons", label: "Persons involved / witnesses", type: "textarea" },
          { name: "lossValue", label: "Estimated loss ($)", type: "number", step: "0.01", half: true, clearable: true },
        ]}
      />

      <Dialog open={Boolean(current)} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <DialogContent className="sm:!max-w-3xl">
          {current && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">{refLabel("INC", current.ref)}</span> {current.type}
                  <StatusPill status={current.severity} /> <StatusPill status={current.status} />
                </DialogTitle>
                <DialogDescription>
                  {current.siteName}{current.zone ? ` · ${current.zone}` : ""} · {fmtDateTime(current.occurredAt)} · reported by {current.guardName ?? "the office"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-3 text-sm">
                  <div><div className="eyebrow mb-1">Narrative</div><p className="whitespace-pre-wrap leading-relaxed">{current.narrative}</p></div>
                  {current.persons && <div><div className="eyebrow mb-1">Persons involved</div><p className="whitespace-pre-wrap text-muted-foreground">{current.persons}</p></div>}
                  {current.lossValue && <div><div className="eyebrow mb-1">Estimated loss</div><span className="num">{money(current.lossValue)}</span></div>}
                  {current.hasPhoto && (
                    <a href={`/api/incidents/${current.id}/photo`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/incidents/${current.id}/photo`} alt="Incident photo" className="max-h-56 rounded-md border" />
                    </a>
                  )}
                  <div className="grid grid-cols-2 gap-3 border-t pt-3">
                    <div className="space-y-1">
                      <div className="eyebrow">Status</div>
                      <Select value={current.status} onChange={(e) => patch({ status: e.target.value }, "Status updated")}>
                        {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <div className="eyebrow">Investigator</div>
                      <div className="flex gap-1.5">
                        <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Name" />
                        <Button variant="outline" disabled={assignee === (current.assignedTo ?? "")} onClick={() => patch({ assignedTo: assignee || null }, "Assignment saved")}>Set</Button>
                      </div>
                    </div>
                    <label className="col-span-2 flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={current.notifyClient} onChange={(e) => patch({ notifyClient: e.target.checked })} /> Client needs to be told about this
                    </label>
                  </div>
                </div>
                <div>
                  <div className="eyebrow mb-2">Timeline</div>
                  <ol className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {current.updates.map((u) => (
                      <li key={u.id} className="border-l-2 border-border pl-3 text-sm">
                        <div className="font-mono text-[11px] text-muted-foreground">{fmtDateTime(u.at)} · {u.actor}</div>
                        <div className="whitespace-pre-wrap">{u.text}</div>
                      </li>
                    ))}
                  </ol>
                  <form
                    className="mt-3 space-y-2 border-t pt-3"
                    onSubmit={async (e) => { e.preventDefault(); if (await patch({ update }, "Update added")) setUpdate(""); }}
                  >
                    <Textarea rows={2} value={update} onChange={(e) => setUpdate(e.target.value)} placeholder="Add an update: action taken, follow-up, outcome…" required />
                    <Button type="submit" size="sm">Add update</Button>
                  </form>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
