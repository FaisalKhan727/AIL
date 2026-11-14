"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/fetcher";
import { money } from "@/lib/ops";
import { downloadCsv } from "@/lib/csv-client";
import { BarList, DataTable, Panel, Stat, auDate, type Col } from "@/components/ops/kit";

interface Pair { label: string; value: number }
interface GuardRow { id: string; name: string; shifts: number; hours: number; incidents: number; patrols: number }
interface Resp {
  days: number;
  series: { date: string; incidents: number; alarms: number }[];
  totals: {
    incidents: number; openIncidents: number; alarms: number; falseAlarmPct: number | null; avgResponseMins: number | null; slaPct: number | null;
    patrolJobs: number; patrolCompletionPct: number | null; patrolRevenue: number; guardHours: number; compliancePct: number | null; trainingPct: number | null;
  };
  incidentsByType: Pair[]; incidentsBySite: Pair[]; alarmsByType: Pair[]; hoursBySite: Pair[]; patrolByRun: Pair[]; guards: GuardRow[];
}

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

/** Two daily series on a shared axis. Kept to lines + a legend; exact values are in the tooltips. */
function Trend({ series }: { series: Resp["series"] }) {
  const W = 720, H = 180, PL = 28, PB = 22, PT = 8;
  const max = Math.max(1, ...series.map((s) => Math.max(s.incidents, s.alarms)));
  const x = (i: number) => PL + (i / Math.max(1, series.length - 1)) * (W - PL - 6);
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const path = (k: "incidents" | "alarms") => series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(" ");
  const ticks = Array.from(new Set([0, Math.ceil(max / 2), max]));
  const labelEvery = Math.max(1, Math.ceil(series.length / 8));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#4C8DFF]" /> Incidents</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#F59E0B]" /> Alarms</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Incidents and alarms per day">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-border" strokeWidth="1" />
            <text x={PL - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground font-mono" fontSize="10">{t}</text>
          </g>
        ))}
        {series.map((s, i) => i % labelEvery === 0 && (
          <text key={s.date} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="10">{s.date.slice(8)}/{s.date.slice(5, 7)}</text>
        ))}
        <path d={path("alarms")} fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinejoin="round" />
        <path d={path("incidents")} fill="none" stroke="#4C8DFF" strokeWidth="2" strokeLinejoin="round" />
        {series.map((s, i) => (
          <rect key={s.date} x={x(i) - 4} y={PT} width={8} height={H - PT - PB} fill="transparent">
            <title>{`${auDate(s.date)}: ${s.incidents} incidents, ${s.alarms} alarms`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = React.useState("30");
  const { data, isLoading } = useQuery<Resp>({ queryKey: ["analytics", days], queryFn: () => api(`/api/analytics?days=${days}`) });
  const t = data?.totals;

  const gCols: Col<GuardRow>[] = [
    { h: "Guard", c: (g) => <span className="font-medium">{g.name}</span> },
    { h: "Shifts", c: (g) => <span className="num">{g.shifts}</span> },
    { h: "Hours", c: (g) => <span className="num">{g.hours}</span> },
    { h: "Patrol runs completed", c: (g) => <span className="num">{g.patrols}</span> },
    { h: "Incidents reported", c: (g) => <span className="num">{g.incidents}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Analytics & Reports"
        description="How the operation performed over the period, drawn from live records."
        actions={
          <>
            <Select className="w-40" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Period">
              <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option>
            </Select>
            <Button variant="outline" disabled={!data} onClick={() => data && downloadCsv(`vigilo-summary-${days}d.csv`, [
              ...Object.entries(data.totals).map(([k, v]) => ({ Section: "Totals", Item: k, Value: v ?? "" })),
              ...data.incidentsByType.map((r) => ({ Section: "Incidents by type", Item: r.label, Value: r.value })),
              ...data.incidentsBySite.map((r) => ({ Section: "Incidents by site", Item: r.label, Value: r.value })),
              ...data.alarmsByType.map((r) => ({ Section: "Alarms by type", Item: r.label, Value: r.value })),
              ...data.hoursBySite.map((r) => ({ Section: "Guard hours by site", Item: r.label, Value: r.value })),
              ...data.patrolByRun.map((r) => ({ Section: "Patrol completion % by run", Item: r.label, Value: r.value })),
              ...data.guards.map((g) => ({ Section: "Guard hours", Item: g.name, Value: g.hours })),
            ])}><Download className="h-4 w-4" /> Export CSV</Button>
          </>
        }
      />
      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {data && t && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Incidents" value={t.incidents} sub={`${t.openIncidents} still open`} />
            <Stat label="Alarms" value={t.alarms} sub={`${pct(t.falseAlarmPct)} false`} />
            <Stat label="Avg alarm response" value={t.avgResponseMins === null ? "—" : `${t.avgResponseMins} min`} sub={`${pct(t.slaPct)} within target`} />
            <Stat label="Patrol completion" value={pct(t.patrolCompletionPct)} sub={`${t.patrolJobs} jobs closed`} />
            <Stat label="Patrol revenue" value={money(t.patrolRevenue)} sub="Billable, ex GST" />
            <Stat label="Guard hours" value={t.guardHours} sub={`${pct(t.compliancePct)} cleared · ${pct(t.trainingPct)} trained`} />
          </div>
          <Panel title={`Incidents and alarms per day — last ${data.days} days`}><Trend series={data.series} /></Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Incidents by type"><BarList data={data.incidentsByType} /></Panel>
            <Panel title="Incidents by site"><BarList data={data.incidentsBySite} /></Panel>
            <Panel title="Alarms by type"><BarList data={data.alarmsByType} /></Panel>
            <Panel title="Guard hours by site"><BarList data={data.hoursBySite} unit=" h" /></Panel>
            <Panel title="Patrol completion by run"><BarList data={data.patrolByRun} unit="%" empty="No patrol jobs closed in this period." /></Panel>
          </div>
          <div>
            <h2 className="mb-2 !font-sans text-[13px] font-semibold">Guard activity</h2>
            <DataTable cols={gCols} rows={data.guards} empty="No guard activity in this period." />
          </div>
        </div>
      )}
    </>
  );
}
