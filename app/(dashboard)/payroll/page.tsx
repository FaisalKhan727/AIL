"use client";
import * as React from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, CheckCircle2, Clock3, FileSpreadsheet, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/fetcher";
import { fmtIso, startOfWeekMon } from "@/lib/date";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface PayrollRow {
  guardId: string;
  guardName: string;
  payRate: number;
  totalHours: number;
  totalPay: number;
  shiftCount: number;
  status: "PENDING" | "PAID";
  paidAt: string | null;
  paidByName: string | null;
}

interface PayrollSummary {
  totalPayroll: number;
  totalPaid: number;
  totalPending: number;
  paidCount: number;
  pendingCount: number;
}

interface Resp {
  weekStart: string;
  weekEnd: string;
  rows: PayrollRow[];
  summary: PayrollSummary;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function SummaryTile({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "navy" | "emerald" | "amber";
}) {
  const tones = {
    navy: "bg-brand-navy/10 text-brand-navy",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
  } as const;
  return (
    <Card className="card-interactive">
      <CardContent className="pt-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
        <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5", tones[tone])}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function downloadFile(name: string, content: BlobPart, type: string) {
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
 * Build the financial statement workbook: a Statement summary sheet (total
 * payroll / paid / pending, as of when it was generated) and a per-guard
 * sheet showing exactly who's been paid and who's still owed — the actual
 * "financial statement" an owner can hand to a bookkeeper.
 */
function buildPayrollWorkbook(rows: PayrollRow[], summary: PayrollSummary, weekStart: string, weekEnd: string): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const statementSheet = XLSX.utils.aoa_to_sheet([
    ["Payroll statement"],
    ["Week", `${fmtIso(weekStart)} to ${fmtIso(weekEnd)}`],
    ["Generated", new Date().toLocaleString()],
    [],
    ["Total payroll", summary.totalPayroll],
    ["Paid", summary.totalPaid, `${summary.paidCount} guard(s)`],
    ["Pending", summary.totalPending, `${summary.pendingCount} guard(s)`],
  ]);
  statementSheet["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, statementSheet, "Statement");

  const guardData = rows.map((r) => ({
    Guard: r.guardName,
    Shifts: r.shiftCount,
    Hours: r.totalHours,
    "Rate ($/hr)": r.payRate,
    "Pay ($)": r.totalPay,
    Status: r.status,
    "Paid on": r.paidAt ? fmtIso(r.paidAt) : "",
    "Paid by": r.paidByName ?? "",
  }));
  const guardSheet = XLSX.utils.json_to_sheet(guardData);
  guardSheet["!cols"] = [
    { wch: 24 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, guardSheet, "By guard");

  return wb;
}

export default function PayrollPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [week, setWeek] = React.useState<string>(fmtIso(startOfWeekMon(new Date())));
  const [busyGuardId, setBusyGuardId] = React.useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  const { data, isLoading } = useQuery<Resp>({
    queryKey: ["payroll", week],
    queryFn: () => api(`/api/payroll?week=${week}`),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["payroll", week] });
  }

  async function markPaid(guardIds: string[]) {
    try {
      const r = await api<{ paidCount: number }>(`/api/payroll/mark-paid`, {
        method: "POST",
        body: JSON.stringify({ weekStart: week, guardIds }),
      });
      toast({ title: `Marked ${r.paidCount} guard${r.paidCount === 1 ? "" : "s"} as paid`, variant: "success" });
      refresh();
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function markUnpaid(guardId: string) {
    try {
      await api(`/api/payroll/mark-unpaid`, {
        method: "POST",
        body: JSON.stringify({ weekStart: week, guardIds: [guardId] }),
      });
      toast({ title: "Marked as pending", variant: "success" });
      refresh();
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function onTogglePaid(row: PayrollRow) {
    setBusyGuardId(row.guardId);
    try {
      if (row.status === "PAID") await markUnpaid(row.guardId);
      else await markPaid([row.guardId]);
    } finally {
      setBusyGuardId(null);
    }
  }

  async function onMarkAllPending() {
    if (!data) return;
    const pendingIds = data.rows.filter((r) => r.status === "PENDING").map((r) => r.guardId);
    if (pendingIds.length === 0) {
      toast({ title: "Nothing pending", description: "Every guard is already marked paid this week." });
      return;
    }
    if (!confirm(`Mark ${pendingIds.length} guard${pendingIds.length === 1 ? "" : "s"} as paid for this week?`)) return;
    setBulkBusy(true);
    try {
      await markPaid(pendingIds);
    } finally {
      setBulkBusy(false);
    }
  }

  function exportStatement() {
    if (!data) return;
    if (data.rows.length === 0) {
      toast({ title: "Nothing to export", description: "No payable shifts in this week." });
      return;
    }
    const wb = buildPayrollWorkbook(data.rows, data.summary, data.weekStart, data.weekEnd);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadFile(
      `payroll-statement-${fmtIso(data.weekStart)}.xlsx`,
      buf,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  return (
    <>
      <PageHeader
        title="Payroll"
        description={data ? `Week ${fmtIso(data.weekStart)} → ${fmtIso(data.weekEnd)}` : "Select week"}
        actions={
          <>
            <Input type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="w-40" />
            <Button variant="outline" onClick={onMarkAllPending} disabled={bulkBusy || !data}>
              <CheckCircle2 className="h-4 w-4" /> Mark all paid
            </Button>
            <Button onClick={exportStatement} disabled={!data}>
              <FileSpreadsheet className="h-4 w-4" /> Export statement
            </Button>
          </>
        }
      />

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <SummaryTile
            label="Total payroll"
            value={money(data.summary.totalPayroll)}
            sub={`${data.rows.length} guard${data.rows.length === 1 ? "" : "s"} this week`}
            icon={<Wallet />}
            tone="navy"
          />
          <SummaryTile
            label="Paid"
            value={money(data.summary.totalPaid)}
            sub={`${data.summary.paidCount} guard${data.summary.paidCount === 1 ? "" : "s"}`}
            icon={<CheckCircle2 />}
            tone="emerald"
          />
          <SummaryTile
            label="Pending"
            value={money(data.summary.totalPending)}
            sub={`${data.summary.pendingCount} guard${data.summary.pendingCount === 1 ? "" : "s"}`}
            icon={<Clock3 />}
            tone="amber"
          />
        </div>
      )}

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Guard</TableHead><TableHead>Shifts</TableHead><TableHead>Hours</TableHead>
            <TableHead>Rate</TableHead><TableHead>Pay</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && data && data.rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payable shifts in this week.</TableCell></TableRow>}
            {data?.rows.map((r) => (
              <TableRow key={r.guardId}>
                <TableCell className="font-medium">{r.guardName}</TableCell>
                <TableCell>{r.shiftCount}</TableCell>
                <TableCell>{r.totalHours}</TableCell>
                <TableCell>${r.payRate.toFixed(2)}</TableCell>
                <TableCell className="font-medium">${r.totalPay.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      r.status === "PAID"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-amber-100 text-amber-800 border-amber-300"
                    }
                  >
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />
                    {r.status === "PAID" ? "Paid" : "Pending"}
                  </Badge>
                  {r.status === "PAID" && r.paidAt && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {fmtIso(r.paidAt)}{r.paidByName ? ` · ${r.paidByName}` : ""}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant={r.status === "PAID" ? "outline" : "default"}
                    onClick={() => onTogglePaid(r)}
                    disabled={busyGuardId === r.guardId}
                  >
                    {r.status === "PAID" ? (
                      <><Undo2 className="h-3 w-3" /> Mark pending</>
                    ) : (
                      <><CheckCircle2 className="h-3 w-3" /> Mark paid</>
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}
