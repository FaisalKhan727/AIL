"use client";
import * as React from "react";
import type * as XLSXModule from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, CheckCircle2, Clock3, FileSpreadsheet, Undo2, ChevronDown, ChevronRight, Pencil, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/skeleton";
import { api } from "@/lib/fetcher";
import { fmtIso, fmtDate, fmtTime } from "@/lib/date";
import { startOfWeekMon } from "@/lib/date";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface PayrollShiftRow {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  siteName: string;
  hours: number;
  hoursOverride: number | null;
  payRate: number;
  payRateOverride: number | null;
  pay: number;
}

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
  shifts: PayrollShiftRow[];
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
 * payroll / paid / pending, as of when it was generated), a per-guard
 * sheet showing who's paid and who's owed, and a per-shift sheet so any
 * hours/rate override is visible in the exported record too.
 */
function buildPayrollWorkbook(
  xlsx: typeof XLSXModule,
  rows: PayrollRow[],
  summary: PayrollSummary,
  weekStart: string,
  weekEnd: string,
): XLSXModule.WorkBook {
  const wb = xlsx.utils.book_new();

  const statementSheet = xlsx.utils.aoa_to_sheet([
    ["Payroll statement"],
    ["Week", `${fmtIso(weekStart)} to ${fmtIso(weekEnd)}`],
    ["Generated", new Date().toLocaleString()],
    [],
    ["Total payroll", summary.totalPayroll],
    ["Paid", summary.totalPaid, `${summary.paidCount} guard(s)`],
    ["Pending", summary.totalPending, `${summary.pendingCount} guard(s)`],
  ]);
  statementSheet["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 16 }];
  xlsx.utils.book_append_sheet(wb, statementSheet, "Statement");

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
  const guardSheet = xlsx.utils.json_to_sheet(guardData);
  guardSheet["!cols"] = [
    { wch: 24 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 18 },
  ];
  xlsx.utils.book_append_sheet(wb, guardSheet, "By guard");

  const shiftData = rows.flatMap((r) =>
    r.shifts.map((s) => ({
      Guard: r.guardName,
      Date: fmtDate(s.startAt),
      Start: fmtTime(s.startAt),
      End: fmtTime(s.endAt),
      Site: s.siteName,
      Hours: s.hours,
      "Hours overridden": s.hoursOverride != null ? "Yes" : "",
      "Rate ($/hr)": s.payRate,
      "Rate overridden": s.payRateOverride != null ? "Yes" : "",
      "Pay ($)": s.pay,
    })),
  );
  const shiftSheet = xlsx.utils.json_to_sheet(shiftData);
  shiftSheet["!cols"] = [
    { wch: 24 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 20 },
    { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 },
  ];
  xlsx.utils.book_append_sheet(wb, shiftSheet, "By shift");

  return wb;
}

interface EditTarget {
  shift: PayrollShiftRow;
  guardName: string;
  guardDefaultRate: number;
}

/** Edit one shift's payable hours and/or pay rate. Both default to the
 *  computed/guard values and can be reset back to them independently. */
function EditShiftPayDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: EditTarget | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [hours, setHours] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!target) return;
    setHours(String(target.shift.hoursOverride ?? target.shift.hours));
    setRate(String(target.shift.payRateOverride ?? target.shift.payRate));
  }, [target]);

  if (!target) return null;
  const { shift, guardName, guardDefaultRate } = target;

  async function save() {
    const hoursNum = hours.trim() === "" ? null : Number(hours);
    const rateNum = rate.trim() === "" ? null : Number(rate);
    if (hoursNum !== null && (Number.isNaN(hoursNum) || hoursNum < 0)) {
      toast({ title: "Hours must be a number ≥ 0", variant: "error" });
      return;
    }
    if (rateNum !== null && (Number.isNaN(rateNum) || rateNum < 0)) {
      toast({ title: "Rate must be a number ≥ 0", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      await api(`/api/shifts/${shift.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          // Only send an override when it actually differs from the
          // computed/default — otherwise clear it (null) so the shift goes
          // back to tracking the normal computed hours / guard rate.
          hoursOverride: hoursNum !== null && hoursNum !== shift.hours ? hoursNum : null,
          payRateOverride: rateNum !== null && rateNum !== guardDefaultRate ? rateNum : null,
        }),
      });
      toast({ title: "Shift pay updated", variant: "success" });
      onOpenChange(false);
      onSaved();
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit shift pay</DialogTitle>
          <DialogDescription>
            {guardName} · {fmtDate(shift.startAt)} · {shift.siteName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Hours</Label>
              <button
                type="button"
                onClick={() => setHours(String(shift.hours))}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Reset to computed ({shift.hours}h)
              </button>
            </div>
            <Input type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Pay rate ($/hr)</Label>
              <button
                type="button"
                onClick={() => setRate(String(guardDefaultRate))}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Reset to default (${guardDefaultRate.toFixed(2)})
              </button>
            </div>
            <Input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Only this shift is affected — every other shift for {guardName.split(" ")[0]} keeps using the computed
            hours and their usual ${guardDefaultRate.toFixed(2)}/hr rate.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PayrollPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [week, setWeek] = React.useState<string>(fmtIso(startOfWeekMon(new Date())));
  const [busyGuardId, setBusyGuardId] = React.useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [exportingStatement, setExportingStatement] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = React.useState<EditTarget | null>(null);

  const { data, isLoading } = useQuery<Resp>({
    queryKey: ["payroll", week],
    queryFn: () => api(`/api/payroll?week=${week}`),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["payroll", week] });
    qc.invalidateQueries({ queryKey: ["timesheets"] });
  }

  function toggleExpanded(guardId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(guardId)) next.delete(guardId);
      else next.add(guardId);
      return next;
    });
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

  async function exportStatement() {
    if (!data) return;
    if (data.rows.length === 0) {
      toast({ title: "Nothing to export", description: "No payable shifts in this week." });
      return;
    }
    setExportingStatement(true);
    try {
      // Loaded on demand — see the same note in the Timesheets export.
      const xlsx = await import("xlsx");
      const wb = buildPayrollWorkbook(xlsx, data.rows, data.summary, data.weekStart, data.weekEnd);
      const buf = xlsx.write(wb, { bookType: "xlsx", type: "array" });
      downloadFile(
        `payroll-statement-${fmtIso(data.weekStart)}.xlsx`,
        buf,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } finally {
      setExportingStatement(false);
    }
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
            <Button onClick={exportStatement} disabled={!data || exportingStatement}>
              <FileSpreadsheet className="h-4 w-4" /> {exportingStatement ? "Preparing…" : "Export statement"}
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
            <TableHead className="w-8"></TableHead>
            <TableHead>Guard</TableHead><TableHead>Shifts</TableHead><TableHead>Hours</TableHead>
            <TableHead>Rate</TableHead><TableHead>Pay</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableSkeletonRows columns={8} />}
            {!isLoading && data && data.rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No payable shifts in this week.</TableCell></TableRow>}
            {data?.rows.map((r) => {
              const isOpen = expanded.has(r.guardId);
              const locked = r.status === "PAID";
              return (
                <React.Fragment key={r.guardId}>
                  <TableRow className="cursor-pointer" onClick={() => toggleExpanded(r.guardId)}>
                    <TableCell>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
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
                  {isOpen && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={8} className="p-0">
                        <div className="px-4 py-3">
                          {locked && (
                            <p className="text-xs text-amber-700 mb-2">
                              This week is marked paid — click &quot;Mark pending&quot; above before editing individual shifts.
                            </p>
                          )}
                          <div className="rounded-md border bg-background overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/40 text-muted-foreground">
                                  <th className="text-left p-2 font-medium">Date</th>
                                  <th className="text-left p-2 font-medium">Site</th>
                                  <th className="text-left p-2 font-medium">Hours</th>
                                  <th className="text-left p-2 font-medium">Rate</th>
                                  <th className="text-left p-2 font-medium">Pay</th>
                                  <th className="text-left p-2 font-medium"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.shifts.map((s) => (
                                  <tr key={s.id} className="border-t">
                                    <td className="p-2 whitespace-nowrap">{fmtDate(s.startAt)} {fmtTime(s.startAt)}–{fmtTime(s.endAt)}</td>
                                    <td className="p-2">{s.siteName}</td>
                                    <td className="p-2 tabular-nums">
                                      {s.hours}h
                                      {s.hoursOverride != null && (
                                        <span className="ml-1 text-[10px] text-blue-700 font-medium">edited</span>
                                      )}
                                    </td>
                                    <td className="p-2 tabular-nums">
                                      ${s.payRate.toFixed(2)}
                                      {s.payRateOverride != null && (
                                        <span className="ml-1 text-[10px] text-blue-700 font-medium">custom</span>
                                      )}
                                    </td>
                                    <td className="p-2 font-medium tabular-nums">${s.pay.toFixed(2)}</td>
                                    <td className="p-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={locked}
                                        title={locked ? "Mark this guard's week pending first to edit" : undefined}
                                        onClick={() => setEditTarget({ shift: s, guardName: r.guardName, guardDefaultRate: r.payRate })}
                                      >
                                        <Pencil className="h-3 w-3" /> Edit
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>

      <EditShiftPayDialog
        target={editTarget}
        onOpenChange={(v) => { if (!v) setEditTarget(null); }}
        onSaved={refresh}
      />
    </>
  );
}
