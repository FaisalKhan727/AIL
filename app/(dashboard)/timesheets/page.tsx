"use client";
import * as React from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Lock, Pencil, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/fetcher";
import { fmtDate, fmtTime, localInputToUtc, utcToLocalInput } from "@/lib/date";
import { cn } from "@/lib/utils";
import { shiftPeriod } from "@/lib/payroll";
import { downloadCsv } from "@/lib/csv-client";
import { Pill, Stat, StatusPill, Tabs, useAct } from "@/components/ops/kit";

interface Timesheet {
  id: string;
  guardId: string;
  guardName: string;
  siteName: string;
  role: string | null;
  rosteredStart: string;
  rosteredEnd: string;
  clockInAt: string | null;
  start: string;
  end: string;
  source: "CLOCK" | "EDITED" | "ROSTER";
  breakMins: number;
  hours: number;
  status: "PENDING" | "APPROVED" | "DISPUTED";
  note: string | null;
  approvedBy: string | null;
  flags: { code: string; label: string }[];
  payRun: { id: string; number: number; status: string } | null;
  invoiced: boolean;
}
interface Resp { period: { start: string; end: string }; frequency: string; timesheets: Timesheet[] }
type Filter = "all" | "todo" | "flagged" | "disputed" | "approved";

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const SOURCE: Record<Timesheet["source"], [string, "green" | "blue" | "grey"]> = {
  CLOCK: ["Clocked", "green"],
  EDITED: ["Edited", "blue"],
  ROSTER: ["Roster", "grey"],
};

export default function TimesheetsPage() {
  const qc = useQueryClient();
  const act = useAct();
  const [period, setPeriod] = React.useState<{ start: string; end: string } | null>(null);
  const qs = period ? `?start=${period.start}&end=${period.end}` : "";
  const { data, isLoading } = useQuery<Resp>({ queryKey: ["timesheets", qs], queryFn: () => api(`/api/timesheets${qs}`), refetchInterval: 30_000 });
  const [filter, setFilter] = React.useState<Filter>("todo");
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<Timesheet | null>(null);
  const [disputing, setDisputing] = React.useState<Timesheet | null>(null);

  React.useEffect(() => { setSel(new Set()); }, [qs, filter]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["timesheets"] });
  const all = data?.timesheets ?? [];
  const cur = data?.period;
  const open = (t: Timesheet) => !t.payRun;
  const rows = all.filter((t) =>
    filter === "all" ? true
    : filter === "todo" ? t.status === "PENDING"
    : filter === "flagged" ? t.flags.length > 0 && t.status !== "APPROVED"
    : filter === "disputed" ? t.status === "DISPUTED"
    : t.status === "APPROVED",
  );
  const selectable = rows.filter((t) => open(t) && t.status !== "APPROVED");
  const approvedHours = all.filter((t) => t.status === "APPROVED").reduce((n, t) => n + t.hours, 0);
  const clean = all.filter((t) => open(t) && t.status === "PENDING" && t.flags.length === 0);

  const patch = (t: Timesheet, body: Record<string, unknown>, ok?: string) =>
    act(async () => { await api(`/api/timesheets/${t.id}`, { method: "PATCH", body: JSON.stringify(body) }); await refresh(); }, ok);
  const approveMany = (ids: string[]) =>
    act(async () => {
      const r = await api<{ approved: number }>(`/api/timesheets/approve`, { method: "POST", body: JSON.stringify({ ids }) });
      setSel(new Set());
      await refresh();
      return r;
    }, `${ids.length} timesheet${ids.length === 1 ? "" : "s"} approved`);

  function exportRows(kind: "csv" | "xlsx") {
    const out = all.map((t) => ({
      Guard: t.guardName,
      Date: fmtDate(t.start),
      Site: t.siteName,
      Role: t.role ?? "",
      "Rostered start": fmtTime(t.rosteredStart),
      "Rostered end": fmtTime(t.rosteredEnd),
      "Worked start": fmtTime(t.start),
      "Worked end": fmtTime(t.end),
      "Break (min)": t.breakMins,
      Hours: t.hours,
      Source: SOURCE[t.source][0],
      Status: t.status,
      "Approved by": t.approvedBy ?? "",
      Flags: t.flags.map((f) => f.label).join("; "),
      "Pay run": t.payRun ? `#${t.payRun.number}` : "",
    }));
    const name = `timesheets-${cur?.start}-to-${cur?.end}`;
    if (kind === "csv") return downloadCsv(`${name}.csv`, out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), "Timesheets");
    const byGuard = Object.values(all.reduce<Record<string, { Guard: string; Shifts: number; Hours: number; Approved: number }>>((m, t) => {
      const r = (m[t.guardId] ??= { Guard: t.guardName, Shifts: 0, Hours: 0, Approved: 0 });
      r.Shifts++; r.Hours = Math.round((r.Hours + t.hours) * 100) / 100;
      if (t.status === "APPROVED") r.Approved = Math.round((r.Approved + t.hours) * 100) / 100;
      return m;
    }, {}));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byGuard), "By guard");
    XLSX.writeFile(wb, `${name}.xlsx`);
  }

  return (
    <>
      <PageHeader
        title="Timesheets"
        description="Hours come from guards clocking in and out in the app. Approve them here; approved hours go to payroll and hourly invoices."
        actions={
          <>
            <Button variant="outline" disabled={!all.length} onClick={() => exportRows("csv")}><Download className="h-4 w-4" /> CSV</Button>
            <Button variant="outline" disabled={!all.length} onClick={() => exportRows("xlsx")}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            <Button asChild><Link href="/payroll">Go to payroll</Link></Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous period" disabled={!cur} onClick={() => cur && setPeriod(shiftPeriod(cur, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="min-w-[13rem] rounded-md border bg-card px-3 py-1.5 text-center">
          <div className="eyebrow">{data?.frequency === "FORTNIGHTLY" ? "Fortnight" : "Week"}</div>
          <div className="num text-sm font-medium">{cur ? `${dmy(cur.start)} – ${dmy(cur.end)}` : "…"}</div>
        </div>
        <Button variant="outline" size="icon" aria-label="Next period" disabled={!cur} onClick={() => cur && setPeriod(shiftPeriod(cur, 1))}><ChevronRight className="h-4 w-4" /></Button>
        {period && <Button variant="ghost" size="sm" onClick={() => setPeriod(null)}>This period</Button>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Timesheets" value={all.length} />
        <Stat label="To approve" value={all.filter((t) => t.status === "PENDING").length} tone="text-warning" />
        <Stat label="Flagged" value={all.filter((t) => t.flags.length && t.status !== "APPROVED").length} tone="text-warning" sub="Late, missing clock, long shift" />
        <Stat label="Disputed" value={all.filter((t) => t.status === "DISPUTED").length} tone="text-red-700" />
        <Stat label="Approved hours" value={Math.round(approvedHours * 10) / 10} />
      </div>

      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        tabs={[
          { key: "todo", label: "To approve", count: all.filter((t) => t.status === "PENDING").length },
          { key: "flagged", label: "Flagged", count: all.filter((t) => t.flags.length && t.status !== "APPROVED").length },
          { key: "disputed", label: "Disputed", count: all.filter((t) => t.status === "DISPUTED").length },
          { key: "approved", label: "Approved", count: all.filter((t) => t.status === "APPROVED").length },
          { key: "all", label: "All", count: all.length },
        ]}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={sel.size === 0} onClick={() => approveMany(Array.from(sel))}><Check className="h-4 w-4" /> Approve selected ({sel.size})</Button>
        <Button size="sm" variant="outline" disabled={clean.length === 0} onClick={() => approveMany(clean.map((t) => t.id))}>
          Approve all without flags ({clean.length})
        </Button>
      </div>

      <div className="overflow-hidden rounded-[10px] border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selectable.length > 0 && selectable.every((t) => sel.has(t.id))}
                  onChange={(e) => setSel(e.target.checked ? new Set(selectable.map((t) => t.id)) : new Set())}
                />
              </TableHead>
              <TableHead>Guard</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Rostered</TableHead>
              <TableHead>Worked</TableHead>
              <TableHead className="text-right">Break</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead>Checks</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={11} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                {all.length === 0 ? "No worked shifts in this period yet." : filter === "todo" ? "Nothing waiting for approval in this period." : "Nothing in this view."}
              </TableCell></TableRow>
            )}
            {rows.map((t) => {
              const locked = !open(t);
              return (
                <TableRow key={t.id} className={cn(t.status === "DISPUTED" && "bg-red-500/[0.04]")}>
                  <TableCell>
                    {!locked && t.status !== "APPROVED" && (
                      <input type="checkbox" aria-label={`Select ${t.guardName} ${fmtDate(t.start)}`} checked={sel.has(t.id)}
                        onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} />
                    )}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{t.guardName}</TableCell>
                  <TableCell className="whitespace-nowrap text-[13px]">{fmtDate(t.start)}</TableCell>
                  <TableCell className="max-w-[12rem] truncate" title={t.siteName}>{t.siteName}</TableCell>
                  <TableCell className="num whitespace-nowrap text-xs text-muted-foreground">{fmtTime(t.rosteredStart)}–{fmtTime(t.rosteredEnd)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="num text-[13px]">{fmtTime(t.start)}–{fmtTime(t.end)}</span>{" "}
                    <Pill tone={SOURCE[t.source][1]} className="ml-1">{SOURCE[t.source][0]}</Pill>
                  </TableCell>
                  <TableCell className="num text-right text-xs">{t.breakMins ? `${t.breakMins}m` : "—"}</TableCell>
                  <TableCell className="num text-right font-medium">{t.hours.toFixed(2)}</TableCell>
                  <TableCell className="max-w-[14rem]">
                    {t.flags.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : (
                      <span className="flex flex-wrap gap-1">
                        {t.flags.map((f) => <span key={f.code} className="inline-flex items-center gap-1 text-xs text-amber-700"><TriangleAlert className="h-3 w-3" />{f.label}</span>)}
                      </span>
                    )}
                    {t.note && <div className="mt-0.5 truncate text-xs text-muted-foreground" title={t.note}>“{t.note}”</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <StatusPill status={t.status === "PENDING" ? "PENDING" : t.status === "APPROVED" ? "APPROVED" : "DISPUTED"} />
                    {t.payRun && <Link href={`/payroll/${t.payRun.id}`} className="ml-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Lock className="h-3 w-3" />Run {t.payRun.number}</Link>}
                  </TableCell>
                  <TableCell>
                    {locked ? <span className="block text-right text-xs text-muted-foreground">Locked</span> : (
                      <div className="flex justify-end gap-1">
                        {t.status !== "APPROVED" && <Button size="sm" onClick={() => patch(t, { action: "approve" }, "Approved")}>Approve</Button>}
                        <Button size="sm" variant="ghost" className="px-2" aria-label="Edit times" onClick={() => setEditing(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        {t.status === "APPROVED"
                          ? <Button size="sm" variant="ghost" onClick={() => patch(t, { action: "reopen" }, "Moved back to approval")}>Reopen</Button>
                          : t.status !== "DISPUTED" && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setDisputing(t)}>Dispute</Button>}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <EditDialog t={editing} onClose={() => setEditing(null)} onSave={async (body, approve) => {
        if (!editing) return false;
        const ok = await patch(editing, { action: "edit", ...body }, approve ? undefined : "Timesheet updated");
        if (ok && approve) await patch(editing, { action: "approve" }, "Updated and approved");
        return ok;
      }} />
      <DisputeDialog t={disputing} onClose={() => setDisputing(null)} onSave={(note) => disputing ? patch(disputing, { action: "dispute", note }, "Marked as disputed") : Promise.resolve(false)} />
    </>
  );
}

function EditDialog({ t, onClose, onSave }: { t: Timesheet | null; onClose: () => void; onSave: (body: Record<string, unknown>, approve: boolean) => Promise<boolean> }) {
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [brk, setBrk] = React.useState("0");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!t) return;
    setStart(utcToLocalInput(t.start)); setEnd(utcToLocalInput(t.end)); setBrk(String(t.breakMins)); setNote(t.note ?? ""); setBusy(false);
  }, [t]);
  if (!t) return null;
  const hrs = start && end ? Math.max(0, (localInputToUtc(end).getTime() - localInputToUtc(start).getTime()) / 3_600_000 - (Number(brk) || 0) / 60) : 0;
  const save = async (approve: boolean) => {
    setBusy(true);
    const ok = await onSave({ start: localInputToUtc(start).toISOString(), end: localInputToUtc(end).toISOString(), breakMins: Number(brk) || 0, note: note.trim() || undefined }, approve);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit timesheet</DialogTitle>
          <DialogDescription>{t.guardName} · {t.siteName} · rostered {fmtTime(t.rosteredStart)}–{fmtTime(t.rosteredEnd)}{t.clockInAt ? ` · clocked in ${fmtTime(t.clockInAt)}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="ts-start">Started</Label><Input id="ts-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="ts-end">Finished</Label><Input id="ts-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="ts-break">Unpaid break (minutes)</Label><Input id="ts-break" type="number" min={0} max={600} value={brk} onChange={(e) => setBrk(e.target.value)} /></div>
          <div className="space-y-1"><div className="label">Paid hours</div><div className="num pt-2 text-lg font-semibold">{hrs.toFixed(2)}</div></div>
        </div>
        <div className="space-y-1"><Label htmlFor="ts-note">Reason for the change</Label><Textarea id="ts-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Forgot to clock out; supervisor confirmed finish at 02:10" /></div>
        <DialogFooter className="dialog-footer-sticky">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" disabled={busy} onClick={() => save(false)}>Save</Button>
          <Button disabled={busy} onClick={() => save(true)}>Save and approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisputeDialog({ t, onClose, onSave }: { t: Timesheet | null; onClose: () => void; onSave: (note: string) => Promise<boolean> }) {
  const [note, setNote] = React.useState("");
  React.useEffect(() => { setNote(""); }, [t]);
  if (!t) return null;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await onSave(note.trim())) onClose(); }}>
          <DialogHeader>
            <DialogTitle>Dispute timesheet</DialogTitle>
            <DialogDescription>{t.guardName} · {fmtDate(t.start)} · {t.siteName}. It stays out of payroll until it&apos;s fixed and approved.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} autoFocus required minLength={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's wrong: e.g. site manager says guard left at 23:00" aria-label="Reason" />
          <DialogFooter className="dialog-footer-sticky">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="destructive">Mark disputed</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
