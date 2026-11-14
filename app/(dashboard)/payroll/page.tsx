"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { money } from "@/lib/ops";
import { CATEGORY_LABEL, periodFor, shiftPeriod, type PayRules, type RateTable } from "@/lib/payroll";
import { DataTable, Panel, Pill, Tabs, useAct, type Col } from "@/components/ops/kit";

interface RunRow {
  id: string; number: number; status: string; periodStart: string; periodEnd: string; payDate: string;
  shiftCount: number; people: unknown[]; totals: { hours: number; gross: number; super: number }; exportedTo: string | null; exportedAt: string | null;
}
interface Settings { rules: PayRules; frequency: "WEEKLY" | "FORTNIGHTLY"; anchor: string; tz: string; defaults: PayRules }
interface Holiday { id: string; date: string; name: string }

const dmy = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function PayrollPage() {
  const [tab, setTab] = React.useState<"runs" | "rules" | "holidays">("runs");
  return (
    <>
      <PageHeader
        title="Payroll"
        description="Turn approved timesheets into pay runs with award penalty rates and super, then send them to your payroll system."
      />
      <p className="mb-4 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
        Vigilo works out hours, gross pay and super. Tax withholding, payslips and Single Touch Payroll reporting to the ATO are done by your payroll system (Xero, MYOB or Employment Hero) when you process the exported run there.
      </p>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "runs", label: "Pay runs" }, { key: "rules", label: "Pay rules" }, { key: "holidays", label: "Public holidays" }]} />
      {tab === "runs" && <Runs />}
      {tab === "rules" && <Rules />}
      {tab === "holidays" && <Holidays />}
    </>
  );
}

function Runs() {
  const router = useRouter();
  const act = useAct();
  const { data: runs = [], isLoading } = useQuery<RunRow[]>({ queryKey: ["pay-runs"], queryFn: () => api(`/api/pay-runs`) });
  const { data: settings } = useQuery<Settings>({ queryKey: ["pay-settings"], queryFn: () => api(`/api/payroll/settings`) });
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ periodStart: "", periodEnd: "", payDate: "" });
  const [busy, setBusy] = React.useState(false);

  function start() {
    if (!settings) return;
    // Default to the last complete period: that's the one normally being paid.
    const cur = periodFor(new Date().toISOString().slice(0, 10), settings.frequency, settings.anchor);
    const prev = shiftPeriod(cur, -1);
    setForm({ periodStart: prev.start, periodEnd: prev.end, payDate: addDays(prev.end, 3) });
    setOpen(true);
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let id = "";
    const ok = await act(async () => { id = (await api<{ id: string }>(`/api/pay-runs`, { method: "POST", body: JSON.stringify(form) })).id; }, "Draft pay run created");
    setBusy(false);
    if (ok) router.push(`/payroll/${id}`);
  }

  const cols: Col<RunRow>[] = [
    { h: "Run", c: (r) => <Link href={`/payroll/${r.id}`} className="num font-medium hover:underline">#{r.number}</Link> },
    { h: "Period", c: (r) => <span className="num whitespace-nowrap text-[13px]">{dmy(r.periodStart)} – {dmy(r.periodEnd)}</span> },
    { h: "Pay date", c: (r) => <span className="num text-[13px]">{dmy(r.payDate)}</span> },
    { h: "Guards", c: (r) => <span className="num">{r.people.length}</span>, className: "text-right" },
    { h: "Hours", c: (r) => <span className="num">{r.totals.hours.toFixed(2)}</span>, className: "text-right" },
    { h: "Gross", c: (r) => <span className="num">{money(r.totals.gross)}</span>, className: "text-right" },
    { h: "Super", c: (r) => <span className="num">{money(r.totals.super)}</span>, className: "text-right" },
    { h: "Status", c: (r) => <Pill tone={r.status === "FINALISED" ? "green" : "grey"}>{r.status === "FINALISED" ? "Finalised" : "Draft"}</Pill> },
    { h: "Sent to", c: (r) => <span className="text-xs text-muted-foreground">{r.exportedTo ?? "—"}</span> },
  ];

  return (
    <>
      <div className="mb-3 flex justify-end"><Button onClick={start} disabled={!settings}><Plus className="h-4 w-4" /> New pay run</Button></div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : <DataTable cols={cols} rows={runs} onRow={(r) => router.push(`/payroll/${r.id}`)} empty="No pay runs yet. Approve some timesheets, then create one." />}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={create} className="space-y-3">
            <DialogHeader>
              <DialogTitle>New pay run</DialogTitle>
              <DialogDescription>Includes every approved timesheet in the period that hasn&apos;t been paid. Unapproved ones wait for a later run.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="pr-s">Period start</Label><Input id="pr-s" type="date" required value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} /></div>
              <div className="space-y-1"><Label htmlFor="pr-e">Period end</Label><Input id="pr-e" type="date" required value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} /></div>
              <div className="space-y-1"><Label htmlFor="pr-p">Pay date</Label><Input id="pr-p" type="date" required value={form.payDate} onChange={(e) => setForm((f) => ({ ...f, payDate: e.target.value }))} /></div>
            </div>
            <DialogFooter className="dialog-footer-sticky">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Calculating…" : "Create draft"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

const RATE_KEYS = Object.keys(CATEGORY_LABEL).filter((k) => k !== "ADJUSTMENT") as (keyof RateTable)[];

function Rules() {
  const qc = useQueryClient();
  const act = useAct();
  const { data: session } = useSession();
  const owner = session?.user?.role === "OWNER";
  const { data } = useQuery<Settings>({ queryKey: ["pay-settings"], queryFn: () => api(`/api/payroll/settings`) });
  const [r, setR] = React.useState<Settings | null>(null);
  React.useEffect(() => { if (data) setR(data); }, [data]);
  if (!r) return <p className="text-muted-foreground">Loading…</p>;
  const set = (patch: Partial<PayRules>) => setR((x) => x && { ...x, rules: { ...x.rules, ...patch } });
  const setRate = (table: "permanent" | "casual", k: keyof RateTable, v: string) =>
    setR((x) => x && { ...x, rules: { ...x.rules, [table]: { ...x.rules[table], [k]: Number(v) } } });
  const save = () => act(async () => {
    await api(`/api/payroll/settings`, { method: "PUT", body: JSON.stringify({ frequency: r.frequency, anchor: r.anchor, rules: r.rules }) });
    await qc.invalidateQueries({ queryKey: ["pay-settings"] });
  }, "Pay rules saved", "Draft pay runs keep their figures until you recalculate them.");
  const num = (id: string, label: string, value: number, onChange: (v: number) => void, step = "0.5", hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" step={step} value={value} disabled={!owner} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {!owner && <p className="notice-warn rounded-md border px-3 py-2 text-sm">Only an owner can change pay rules.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pay period">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pf">Frequency</Label>
              <Select id="pf" value={r.frequency} disabled={!owner} onChange={(e) => setR({ ...r, frequency: e.target.value as Settings["frequency"] })}>
                <option value="WEEKLY">Weekly</option><option value="FORTNIGHTLY">Fortnightly</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pa">A period started on</Label>
              <Input id="pa" type="date" value={r.anchor} disabled={!owner} onChange={(e) => setR({ ...r, anchor: e.target.value })} />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Times are worked out in {r.tz}. Change the timezone in Settings.</p>
        </Panel>
        <Panel title="Hours and super">
          <div className="grid grid-cols-2 gap-3">
            {num("sr", "Super guarantee (%)", r.rules.superRate, (v) => set({ superRate: v }), "0.5", "12% from 1 July 2025")}
            <div />
            <div className="space-y-1"><Label htmlFor="ns">Night rate from</Label><Input id="ns" type="time" value={r.rules.nightStart} disabled={!owner} onChange={(e) => set({ nightStart: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="ne">Night rate until</Label><Input id="ne" type="time" value={r.rules.nightEnd} disabled={!owner} onChange={(e) => set({ nightEnd: e.target.value })} /></div>
            {num("do", "Overtime after (hours per shift)", r.rules.dailyOtHours, (v) => set({ dailyOtHours: v }), "0.5", "Award: 10, or 12 by agreement")}
            {num("wo", "Overtime after (hours per week)", r.rules.weeklyOtHours, (v) => set({ weeklyOtHours: v }), "0.5")}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={r.rules.weeklyOtCasual} disabled={!owner} onChange={(e) => set({ weeklyOtCasual: e.target.checked })} /> Apply the weekly limit to casuals too
          </label>
        </Panel>
      </div>
      <Panel title="Rates, as a multiple of the guard's base rate">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="py-1.5">Hours worked</th><th className="py-1.5">Full-time / part-time</th><th className="py-1.5">Casual (includes 25% loading)</th></tr>
            </thead>
            <tbody>
              {RATE_KEYS.map((k) => (
                <tr key={k} className="border-t">
                  <td className="py-2 pr-3">{CATEGORY_LABEL[k]}</td>
                  {(["permanent", "casual"] as const).map((t) => (
                    <td key={t} className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <Input className="h-8 w-24 num" type="number" step="0.001" min="0" max="10" aria-label={`${CATEGORY_LABEL[k]} ${t}`} value={r.rules[t][k]} disabled={!owner} onChange={(e) => setRate(t, k, e.target.value)} />
                        <span className="num text-xs text-muted-foreground">{Math.round(r.rules[t][k] * 1000) / 10}%</span>
                        {r.rules[t][k] !== r.defaults[t][k] && <span className="text-xs text-amber-700">default {Math.round(r.defaults[t][k] * 1000) / 10}%</span>}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Defaults follow the Security Services Industry Award 2020 (MA000016): weekday 6pm–6am 121.7%, Saturday 150%, Sunday 200%, public holidays 250%, overtime 150% for two hours then 200%.
          Casual overtime rates and the 130% permanent-night loading aren&apos;t confirmed from the award text, so check them against the current Fair Work pay guide before your first run.
        </p>
      </Panel>
      {owner && <div className="flex justify-end"><Button onClick={save}>Save pay rules</Button></div>}
    </div>
  );
}

function Holidays() {
  const qc = useQueryClient();
  const act = useAct();
  const { data: list = [] } = useQuery<Holiday[]>({ queryKey: ["holidays"], queryFn: () => api(`/api/payroll/holidays`) });
  const [date, setDate] = React.useState("");
  const [name, setName] = React.useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["holidays"] });
  const year = new Date().getFullYear().toString();
  const shown = list.filter((h) => h.date >= `${year}-01-01`);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <DataTable
        cols={[
          { h: "Date", c: (h) => <span className="num">{dmy(h.date)}</span> },
          { h: "Day", c: (h) => new Date(`${h.date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", timeZone: "UTC" }) },
          { h: "Holiday", c: (h) => h.name },
          { h: "", className: "text-right", c: (h) => <Button size="sm" variant="ghost" className="px-2 text-red-700" aria-label={`Remove ${h.name}`} onClick={async () => { if (await act(() => api(`/api/payroll/holidays?id=${h.id}`, { method: "DELETE" }), "Holiday removed")) refresh(); }}><Trash2 className="h-3.5 w-3.5" /></Button> },
        ]}
        rows={shown}
        empty="No public holidays set. Hours on a public holiday are paid at the normal day rate until you add them."
      />
      <div className="space-y-4">
        <Panel title="Add Victorian holidays">
          <p className="text-sm text-muted-foreground">Adds the 2026 and 2027 Victorian public holidays. The 2027 Grand Final Friday isn&apos;t announced yet; add it when it is.</p>
          <Button className="mt-3 w-full" variant="outline" onClick={async () => { if (await act(() => api(`/api/payroll/holidays`, { method: "POST", body: JSON.stringify({ preset: "VIC" }) }), "Victorian holidays added")) refresh(); }}>Add VIC 2026–27</Button>
        </Panel>
        <Panel title="Add a holiday">
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await act(() => api(`/api/payroll/holidays`, { method: "POST", body: JSON.stringify({ date, name }) }), "Holiday added")) { setDate(""); setName(""); refresh(); } }}>
            <div className="space-y-1"><Label htmlFor="hd">Date</Label><Input id="hd" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="hn">Name</Label><Input id="hn" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Local show day" /></div>
            <Button type="submit" className="w-full">Add holiday</Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
