"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { NewAlarmDialog } from "@/components/alarms/new-alarm-dialog";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";

interface AlarmRow {
  id: string;
  docket: string;
  receivedAt: string;
  source: string;
  sourceReference: string | null;
  siteName: string;
  clientName: string | null;
  alarmType: string;
  priority: string;
  status: string;
  responderName: string | null;
  timeOnSiteMin: number | null;
}

const STATUSES = ["DISPATCHED", "ACKNOWLEDGED", "ONSITE", "COMPLETED", "NO_RESPONSE", "CANCELLED"];

function priorityClass(p: string): string {
  switch (p) {
    case "CRITICAL":
      return "bg-red-100 text-red-900 border-red-300";
    case "HIGH":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "MEDIUM":
      return "bg-blue-100 text-blue-900 border-blue-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

function statusClass(s: string): string {
  switch (s) {
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case "ONSITE":
      return "bg-cyan-100 text-cyan-900 border-cyan-300";
    case "ACKNOWLEDGED":
      return "bg-blue-100 text-blue-900 border-blue-300";
    case "DISPATCHED":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "NO_RESPONSE":
      return "bg-red-100 text-red-900 border-red-300";
    case "CANCELLED":
      return "bg-slate-100 text-slate-600 border-slate-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full border", className)}>
      {children}
    </span>
  );
}

export default function AlarmsPage() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string[]>([]);

  const queryParams = React.useMemo(() => {
    const sp = new URLSearchParams();
    if (search.trim()) sp.set("q", search.trim());
    if (statusFilter.length > 0) sp.set("status", statusFilter.join(","));
    return sp.toString() ? `?${sp.toString()}` : "";
  }, [search, statusFilter]);

  const { data: alarms = [], isLoading } = useQuery<AlarmRow[]>({
    queryKey: ["alarms", queryParams],
    queryFn: () => api(`/api/alarms${queryParams}`),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  function toggleStatus(s: string) {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  // Group alarms by calendar month (alarms come back sorted desc, so this
  // produces month buckets in reverse-chronological order). Used to render
  // section headers between rows / cards.
  const grouped = React.useMemo(() => {
    const out: Array<{ monthKey: string; monthLabel: string; rows: AlarmRow[] }> = [];
    let currentKey = "";
    for (const a of alarms) {
      const d = new Date(a.receivedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key !== currentKey) {
        const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        out.push({ monthKey: key, monthLabel: label, rows: [] });
        currentKey = key;
      }
      out[out.length - 1].rows.push(a);
    }
    return out;
  }, [alarms]);

  return (
    <>
      <PageHeader
        title="Alarms"
        description={`${alarms.length} alarm${alarms.length === 1 ? "" : "s"}`}
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New Alarm
          </Button>
        }
      />

      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by docket, site, client, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={cn(
                "text-[11px] uppercase tracking-wide font-medium px-2 py-1 rounded-full border",
                statusFilter.includes(s)
                  ? statusClass(s)
                  : "bg-background border-slate-300 text-muted-foreground hover:bg-muted",
              )}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: table */}
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Docket</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Responder</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>On site</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && alarms.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                    No alarms yet. Click <em>New Alarm</em> to create one.
                  </TableCell>
                </TableRow>
              )}
              {grouped.map((g) => (
                <React.Fragment key={g.monthKey}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={10} className="py-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.monthLabel} <span className="ml-1 font-normal text-muted-foreground/80">· {g.rows.length} alarm{g.rows.length === 1 ? "" : "s"}</span>
                    </TableCell>
                  </TableRow>
                  {g.rows.map((a) => (
                    <TableRow key={a.id} className="hover:bg-muted/40">
                      <TableCell>
                        <Link href={`/alarms/${a.id}`} className="font-mono font-semibold text-brand-navy hover:underline">
                          #{a.docket}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(a.receivedAt)}</TableCell>
                      <TableCell className="text-xs">
                        {a.source}
                        {a.sourceReference && <span className="text-muted-foreground"> · {a.sourceReference}</span>}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">{a.siteName}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{a.clientName ?? "—"}</TableCell>
                      <TableCell><Pill className="bg-slate-100 text-slate-700 border-slate-300">{a.alarmType}</Pill></TableCell>
                      <TableCell><Pill className={priorityClass(a.priority)}>{a.priority}</Pill></TableCell>
                      <TableCell className="text-xs max-w-[140px] truncate">{a.responderName ?? "—"}</TableCell>
                      <TableCell><Pill className={statusClass(a.status)}>{a.status.replace("_", " ")}</Pill></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {a.timeOnSiteMin !== null ? `${a.timeOnSiteMin} min` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile: card list grouped by month */}
      <div className="md:hidden space-y-2">
        {isLoading && <Card><CardContent className="py-8 text-center text-muted-foreground">Loading…</CardContent></Card>}
        {!isLoading && alarms.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No alarms yet.</CardContent></Card>
        )}
        {grouped.map((g) => (
          <React.Fragment key={g.monthKey}>
            <h3 className="pt-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {g.monthLabel}
              <span className="ml-1 font-normal text-muted-foreground/80">· {g.rows.length} alarm{g.rows.length === 1 ? "" : "s"}</span>
            </h3>
            {g.rows.map((a) => (
        <Link key={a.id} href={`/alarms/${a.id}`}>
            <Card className="active:opacity-70">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-base text-brand-navy">#{a.docket}</span>
                  <Pill className={statusClass(a.status)}>{a.status.replace("_", " ")}</Pill>
                </div>
                <p className="mt-1 text-sm font-medium truncate">{a.siteName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {a.alarmType} · {a.source}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{fmtDateTime(a.receivedAt)}</span>
                  <Pill className={priorityClass(a.priority)}>{a.priority}</Pill>
                </div>
                {a.responderName && (
                  <p className="mt-1 text-xs text-muted-foreground">→ {a.responderName}</p>
                )}
              </CardContent>
            </Card>
          </Link>
            ))}
          </React.Fragment>
        ))}
      </div>

      <NewAlarmDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["alarms"] });
        }}
      />
    </>
  );
}
