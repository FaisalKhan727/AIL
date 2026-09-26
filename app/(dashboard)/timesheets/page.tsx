"use client";
import * as React from "react";
import type * as XLSXModule from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileDown, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/skeleton";
import { api } from "@/lib/fetcher";
import { fmtDate, fmtTime, fmtIso, startOfWeekMon } from "@/lib/date";
import { useToast } from "@/components/ui/toast";

interface ShiftRow {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  siteName: string;
  /** Payable hours for this one shift — worked times if set (and plausible),
   *  else scheduled times. Computed server-side (lib/hours.ts) so it always
   *  agrees with the guard's totalHours below. */
  hours: number;
}

interface Row {
  guardId: string;
  guardName: string;
  payRate: number;
  totalHours: number;
  totalPay: number;
  shifts: ShiftRow[];
}

interface Resp { weekStart: string; weekEnd: string; rows: Row[]; }

function rowsToCsv(rows: Row[], weekStart: string): string {
  const lines = ["Guard,Shifts,Hours,Rate,Pay,WeekStart"];
  for (const r of rows) {
    lines.push(`"${r.guardName}",${r.shifts.length},${r.totalHours},${r.payRate.toFixed(2)},${r.totalPay.toFixed(2)},${fmtIso(weekStart)}`);
  }
  return lines.join("\n");
}

function downloadFile(name: string, content: BlobPart, type = "text/csv") {
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

/**
 * Build an .xlsx workbook with two sheets:
 *   - Summary: one row per guard (shift count, hours, rate, pay).
 *   - Shift detail: one row per individual shift, with its own hours — so
 *     the export shows exactly how each guard's total was made up (and an
 *     implausible single shift, like a 30h one from a bad End date, is
 *     visible on its own row instead of hiding inside a weekly total).
 * Both sheets are derived from the same per-shift `hours` the API computes,
 * so the two always reconcile.
 */
function buildTimesheetWorkbook(
  xlsx: typeof XLSXModule,
  rows: Row[],
  weekStart: string,
  weekEnd: string,
): XLSXModule.WorkBook {
  const wb = xlsx.utils.book_new();

  interface SummaryRow {
    Guard: string;
    Shifts: number;
    Hours: number;
    "Rate ($/hr)": number | string;
    "Pay ($)": number;
  }
  const summaryData: SummaryRow[] = rows.map((r) => ({
    Guard: r.guardName,
    Shifts: r.shifts.length,
    Hours: r.totalHours,
    "Rate ($/hr)": r.payRate,
    "Pay ($)": r.totalPay,
  }));
  summaryData.push({
    Guard: "TOTAL",
    Shifts: rows.reduce((sum, r) => sum + r.shifts.length, 0),
    Hours: Math.round(rows.reduce((sum, r) => sum + r.totalHours, 0) * 100) / 100,
    "Rate ($/hr)": "",
    "Pay ($)": Math.round(rows.reduce((sum, r) => sum + r.totalPay, 0) * 100) / 100,
  });
  const summarySheet = xlsx.utils.json_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 24 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  xlsx.utils.book_append_sheet(wb, summarySheet, "Summary");

  const detailData = rows.flatMap((r) =>
    r.shifts.map((s) => ({
      Guard: r.guardName,
      Date: fmtDate(s.startAt),
      Start: fmtTime(s.startAt),
      End: fmtTime(s.endAt),
      Site: s.siteName,
      Status: s.status,
      Hours: s.hours,
      "Rate ($/hr)": r.payRate,
      "Pay ($)": Math.round(s.hours * r.payRate * 100) / 100,
    })),
  );
  const detailSheet = xlsx.utils.json_to_sheet(detailData);
  detailSheet["!cols"] = [
    { wch: 24 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
    { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 10 },
  ];
  xlsx.utils.book_append_sheet(wb, detailSheet, "Shift detail");

  const infoSheet = xlsx.utils.aoa_to_sheet([
    ["Week start", fmtIso(weekStart)],
    ["Week end", fmtIso(weekEnd)],
    ["Generated", new Date().toLocaleString()],
  ]);
  infoSheet["!cols"] = [{ wch: 14 }, { wch: 24 }];
  xlsx.utils.book_append_sheet(wb, infoSheet, "Week");

  return wb;
}

// Guard names and site names are free-text fields entered by admins, so they
// must be escaped before going into an HTML string that's handed to
// document.write() — otherwise a name like `<img src=x onerror=...>` would
// execute as script in the print window (stored XSS).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPrintableTimesheet(row: Row, weekStart: string, weekEnd: string): string {
  const guardName = escapeHtml(row.guardName);
  const rows = row.shifts
    .map((s) => `<tr><td>${fmtDate(s.startAt)}</td><td>${fmtTime(s.startAt)}–${fmtTime(s.endAt)}</td><td>${escapeHtml(s.siteName)}</td><td>${escapeHtml(s.status)}</td><td>${s.hours}</td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Timesheet — ${guardName}</title>
    <style>body{font-family:system-ui,sans-serif;margin:2rem;color:#0B1E3F}
    h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:1rem}
    th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:14px}
    .totals{margin-top:1rem;font-size:1.1rem}</style></head><body>
    <h1>Timesheet</h1>
    <p><strong>${guardName}</strong> · Week ${fmtIso(weekStart)} → ${fmtIso(weekEnd)}</p>
    <table><thead><tr><th>Date</th><th>Time</th><th>Site</th><th>Status</th><th>Hours</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="totals">Hours: <strong>${row.totalHours}</strong> · Rate: $${row.payRate.toFixed(2)} · Pay: <strong>$${row.totalPay.toFixed(2)}</strong></p>
    <script>window.onload=()=>setTimeout(()=>window.print(),250)</script>
  </body></html>`;
}

export default function TimesheetsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [week, setWeek] = React.useState<string>(fmtIso(startOfWeekMon(new Date())));
  const [exportingExcel, setExportingExcel] = React.useState(false);

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

  async function exportAllExcel() {
    if (!data) return;
    if (data.rows.length === 0) {
      toast({ title: "Nothing to export", description: "No payable shifts in this week." });
      return;
    }
    setExportingExcel(true);
    try {
      // Loaded on demand instead of bundled into the page's initial JS —
      // xlsx (SheetJS) is a sizeable library that most visits never touch
      // (only clicked when someone actually wants the .xlsx download).
      const xlsx = await import("xlsx");
      const wb = buildTimesheetWorkbook(xlsx, data.rows, data.weekStart, data.weekEnd);
      const buf = xlsx.write(wb, { bookType: "xlsx", type: "array" });
      downloadFile(
        `timesheets-${fmtIso(data.weekStart)}.xlsx`,
        buf,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } finally {
      setExportingExcel(false);
    }
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
            <Button onClick={exportAllExcel} disabled={!data || exportingExcel}>
              <FileSpreadsheet className="h-4 w-4" /> {exportingExcel ? "Preparing…" : "Export Excel"}
            </Button>
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
            {isLoading && <TableSkeletonRows columns={6} />}
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
                    {r.shifts.map((s) => {
                      const suspicious = s.hours > 16 || (s.hours > 0 && s.hours < 0.25);
                      return (
                        <span key={s.id} className={suspicious ? "text-amber-700 font-medium" : undefined}>
                          {suspicious ? "⚠ " : ""}
                          {fmtDate(s.startAt)} {fmtTime(s.startAt)}–{fmtTime(s.endAt)} · {s.siteName} · {s.hours}h ({s.status})
                        </span>
                      );
                    }).reduce((acc, el, i) => (i === 0 ? [el] : [...acc, "  ·  ", el]), [] as React.ReactNode[])}
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
