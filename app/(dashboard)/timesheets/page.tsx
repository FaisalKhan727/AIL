"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileDown, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/fetcher";
import { fmtDate, fmtTime, fmtIso, startOfWeekMon } from "@/lib/date";
import { useToast } from "@/components/ui/toast";

interface Row {
  guardId: string;
  guardName: string;
  payRate: number;
  totalHours: number;
  totalPay: number;
  shifts: Array<{ id: string; startAt: string; endAt: string; status: string; siteName: string }>;
}

interface Resp { weekStart: string; weekEnd: string; rows: Row[]; }

function rowsToCsv(rows: Row[], weekStart: string): string {
  const lines = ["Guard,Shifts,Hours,Rate,Pay,WeekStart"];
  for (const r of rows) {
    lines.push(`"${r.guardName}",${r.shifts.length},${r.totalHours},${r.payRate.toFixed(2)},${r.totalPay.toFixed(2)},${fmtIso(weekStart)}`);
  }
  return lines.join("\n");
}

function downloadFile(name: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildPrintableTimesheet(row: Row, weekStart: string, weekEnd: string): string {
  const rows = row.shifts.map((s) => `<tr><td>${fmtDate(s.startAt)}</td><td>${fmtTime(s.startAt)}–${fmtTime(s.endAt)}</td><td>${s.siteName}</td><td>${s.status}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Timesheet — ${row.guardName}</title>
    <style>body{font-family:system-ui,sans-serif;margin:2rem;color:#0B1E3F}
    h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:1rem}
    th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:14px}
    .totals{margin-top:1rem;font-size:1.1rem}</style></head><body>
    <h1>Timesheet</h1>
    <p><strong>${row.guardName}</strong> · Week ${fmtIso(weekStart)} → ${fmtIso(weekEnd)}</p>
    <table><thead><tr><th>Date</th><th>Time</th><th>Site</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="totals">Hours: <strong>${row.totalHours}</strong> · Rate: $${row.payRate.toFixed(2)} · Pay: <strong>$${row.totalPay.toFixed(2)}</strong></p>
    <script>window.onload=()=>setTimeout(()=>window.print(),250)</script>
  </body></html>`;
}

export default function TimesheetsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [week, setWeek] = React.useState<string>(fmtIso(startOfWeekMon(new Date())));

  const { data, isLoading } = useQuery<Resp>({
    queryKey: ["timesheets", week],
    queryFn: () => api(`/api/timesheets?week=${week}`),
  });

  async function markAllWorked() {
    if (!data) return;
    const ids = data.rows.flatMap((r) => r.shifts.filter((s) => s.status === "CONFIRMED").map((s) => s.id));
    if (ids.length === 0) {
      toast({ title: "No CONFIRMED shifts to mark." });
      return;
    }
    try {
      const r = await api<{ updated: number }>(`/api/timesheets/mark-worked`, { method: "POST", body: JSON.stringify({ shiftIds: ids }) });
      toast({ title: `Marked ${r.updated} shift(s) as worked`, variant: "success" });
      qc.invalidateQueries({ queryKey: ["timesheets"] });
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  function exportAllCsv() {
    if (!data) return;
    downloadFile(`timesheets-${fmtIso(data.weekStart)}.csv`, rowsToCsv(data.rows, data.weekStart));
  }

  function printOne(row: Row) {
    if (!data) return;
    const w = window.open("", "_blank", "width=900,height=900");
    if (!w) return;
    w.document.write(buildPrintableTimesheet(row, data.weekStart, data.weekEnd));
    w.document.close();
  }

  return (
    <>
      <PageHeader
        title="Timesheets"
        description={data ? `Week ${fmtIso(data.weekStart)} → ${fmtIso(data.weekEnd)}` : "Select week"}
        actions={
          <>
            <Input type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="w-40" />
            <Button variant="outline" onClick={markAllWorked}><CheckCircle2 className="h-4 w-4" /> Mark all worked</Button>
            <Button variant="outline" onClick={exportAllCsv} disabled={!data}><Download className="h-4 w-4" /> Export CSV</Button>
          </>
        }
      />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Guard</TableHead><TableHead>Shifts</TableHead><TableHead>Hours</TableHead>
            <TableHead>Rate</TableHead><TableHead>Pay</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && data && data.rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No payable shifts in this week.</TableCell></TableRow>}
            {data?.rows.map((r) => (
              <React.Fragment key={r.guardId}>
                <TableRow>
                  <TableCell className="font-medium">{r.guardName}</TableCell>
                  <TableCell>{r.shifts.length}</TableCell>
                  <TableCell>{r.totalHours}</TableCell>
                  <TableCell>${r.payRate.toFixed(2)}</TableCell>
                  <TableCell className="font-medium">${r.totalPay.toFixed(2)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => printOne(r)}>
                      <FileDown className="h-3 w-3" /> PDF
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow className="bg-muted/20">
                  <TableCell colSpan={6} className="text-xs text-muted-foreground py-2">
                    {r.shifts.map((s) => `${fmtDate(s.startAt)} ${fmtTime(s.startAt)}–${fmtTime(s.endAt)} · ${s.siteName} (${s.status})`).join("  ·  ")}
                  </TableCell>
                </TableRow>
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}
