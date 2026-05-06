"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, RefreshCcw, AlertTriangle, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShiftFormDialog } from "@/components/rosters/shift-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { api } from "@/lib/fetcher";
import { addDays, fmtTime } from "@/lib/date";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Shift {
  id: string;
  guardId: string | null;
  siteId: string;
  startAt: string;
  endAt: string;
  status: string;
  role: string | null;
  notes: string | null;
  publishedAt: string | null;
  guard: { id: string; firstName: string; lastName: string } | null;
  site: { id: string; name: string };
}

type ViewMode = "guard" | "site";

interface Roster {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  publishedAt: string | null;
  shifts: Shift[];
}

function statusCellClass(status: string) {
  switch (status) {
    case "CONFIRMED": case "WORKED": return "bg-emerald-50 border-emerald-300";
    case "REJECTED": case "NO_SHOW": return "bg-red-50 border-red-300";
    case "PENDING": return "bg-amber-50 border-amber-300";
    case "CANCELLED": return "bg-zinc-100 border-zinc-300";
    default: return "bg-slate-50 border-slate-300";
  }
}

function detectConflicts(shifts: Shift[]): Set<string> {
  const conflicting = new Set<string>();
  const byGuard = new Map<string, Shift[]>();
  for (const s of shifts) {
    if (!s.guardId) continue;
    const list = byGuard.get(s.guardId) ?? [];
    list.push(s);
    byGuard.set(s.guardId, list);
  }
  for (const list of byGuard.values()) {
    list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    for (let i = 1; i < list.length; i++) {
      if (list[i].startAt < list[i - 1].endAt) {
        conflicting.add(list[i].id);
        conflicting.add(list[i - 1].id);
      }
    }
  }
  return conflicting;
}

export default function RosterBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [shiftOpen, setShiftOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Shift | null>(null);
  const [presetGuardId, setPresetGuardId] = React.useState<string | undefined>();
  const [presetSiteId, setPresetSiteId] = React.useState<string | undefined>();
  const [presetStart, setPresetStart] = React.useState<Date | undefined>();

  // View-mode toggle (Guard rows vs Site rows). Persists per browser so
  // operators don't have to re-pick on every visit.
  const [viewMode, setViewMode] = React.useState<ViewMode>("guard");
  React.useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("roster.viewMode") : null;
    if (stored === "guard" || stored === "site") setViewMode(stored);
  }, []);
  const setView = (m: ViewMode) => {
    setViewMode(m);
    if (typeof window !== "undefined") window.localStorage.setItem("roster.viewMode", m);
  };

  const { data, refetch } = useQuery<Roster>({
    queryKey: ["roster", id],
    queryFn: () => api(`/api/rosters/${id}`),
    refetchInterval: 5000, // live status updates
  });

  if (!data) return <div className="text-muted-foreground">Loading…</div>;

  const start = new Date(data.startDate);
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const guardMap = new Map<string, { id: string; firstName: string; lastName: string }>();
  for (const s of data.shifts) {
    if (s.guardId && s.guard) guardMap.set(s.guardId, s.guard);
  }
  const guardList = Array.from(guardMap.values()).sort((a, b) => a.lastName.localeCompare(b.lastName));

  const siteMap = new Map<string, { id: string; name: string }>();
  for (const s of data.shifts) siteMap.set(s.siteId, s.site);
  const siteList = Array.from(siteMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  type Row = { id: string; label: string };
  const rows: Row[] = viewMode === "guard"
    ? guardList.map((g) => ({ id: g.id, label: `${g.firstName} ${g.lastName}` }))
    : siteList.map((s) => ({ id: s.id, label: s.name }));
  const rowHeading = viewMode === "guard" ? "Guard" : "Site";

  function shiftsForRowDay(rowId: string, day: Date): Shift[] {
    const dayStr = day.toDateString();
    return data!.shifts.filter((s) =>
      new Date(s.startAt).toDateString() === dayStr &&
      (viewMode === "guard" ? s.guardId === rowId : s.siteId === rowId),
    );
  }

  const conflicts = detectConflicts(data.shifts);

  const totalCounts = data.shifts.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  async function publishAll() {
    try {
      const r = await api<{ ok: boolean; sent: number; failedCount: number; failed: { to: string; error?: string }[] }>(
        `/api/rosters/${id}/publish`, { method: "POST" });
      if (r.sent === 0 && r.failedCount === 0) {
        toast({ title: "Nothing to publish — every shift already sent", variant: "default" });
      } else if (r.failedCount > 0) {
        toast({
          title: `Sent ${r.sent}, ${r.failedCount} failed`,
          description: r.failed.map((f) => `${f.to}: ${f.error ?? "failed"}`).join("\n"),
          variant: "error",
        });
      } else {
        toast({ title: `Sent ${r.sent} SMS`, variant: "success" });
      }
      refetch();
    } catch (e: unknown) {
      toast({ title: "Publish failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function publishSingle(shift: Shift) {
    try {
      await api(`/api/shifts/${shift.id}/resend`, { method: "POST" });
      const who = shift.guard ? `${shift.guard.firstName} ${shift.guard.lastName}` : "guard";
      toast({
        title: shift.publishedAt ? `SMS re-sent to ${who}` : `SMS sent to ${who}`,
        variant: "success",
      });
      refetch();
    } catch (e: unknown) {
      toast({ title: "Send failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function deleteRoster() {
    const shiftSuffix = data && data.shifts.length > 0
      ? ` and all ${data.shifts.length} shift${data.shifts.length === 1 ? "" : "s"}`
      : "";
    if (!confirm(`Delete roster "${data?.name}"${shiftSuffix}? This cannot be undone.`)) return;
    try {
      await api(`/api/rosters/${id}`, { method: "DELETE" });
      toast({ title: "Roster deleted", variant: "success" });
      qc.invalidateQueries({ queryKey: ["rosters"] });
      router.push("/rosters");
    } catch (e: unknown) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function resendAll() {
    try {
      const r = await api<{ sent: number; failedCount: number; failed: { to: string; error?: string }[] }>(
        `/api/rosters/${id}/resend`, { method: "POST" });
      if (r.failedCount > 0) {
        toast({
          title: `Re-sent ${r.sent}, ${r.failedCount} failed`,
          description: r.failed.map((f) => `${f.to}: ${f.error ?? "failed"}`).join("\n"),
          variant: "error",
        });
      } else {
        toast({ title: `Re-sent ${r.sent} SMS`, variant: "success" });
      }
    } catch (e: unknown) {
      toast({ title: "Resend failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  function openNewShift(opts?: { guardId?: string; siteId?: string; day?: Date }) {
    setEditing(null);
    setPresetGuardId(opts?.guardId);
    setPresetSiteId(opts?.siteId);
    if (opts?.day) {
      const d = new Date(opts.day);
      d.setHours(18, 0, 0, 0);
      setPresetStart(d);
    } else {
      setPresetStart(undefined);
    }
    setShiftOpen(true);
  }

  function openEdit(s: Shift) {
    setEditing(s);
    setPresetGuardId(undefined);
    setPresetSiteId(undefined);
    setPresetStart(undefined);
    setShiftOpen(true);
  }

  const unsentCount = data.shifts.filter((s) => !s.publishedAt).length;

  return (
    <>
      <PageHeader
        title={data.name}
        description={`${data.shifts.length} shifts · ${totalCounts.CONFIRMED ?? 0} confirmed · ${totalCounts.PENDING ?? 0} pending · ${totalCounts.REJECTED ?? 0} rejected${unsentCount > 0 ? ` · ${unsentCount} unsent` : ""}`}
        actions={
          <>
            <Button variant="outline" onClick={() => openNewShift()}><Plus className="h-4 w-4" /> Add Shift</Button>
            <Button onClick={publishAll} disabled={unsentCount === 0}>
              <Send className="h-4 w-4" /> Publish all{unsentCount > 0 ? ` (${unsentCount})` : ""}
            </Button>
            <Button variant="outline" onClick={resendAll} disabled={data.shifts.length === 0}>
              <RefreshCcw className="h-4 w-4" /> Resend all
            </Button>
            <Button variant="destructive" onClick={deleteRoster}><Trash2 className="h-4 w-4" /> Delete</Button>
          </>
        }
      />

      {conflicts.size > 0 && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="pt-6 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span><strong>{conflicts.size / 2}</strong> overlapping shift pair(s) detected. Resolve before publishing.</span>
          </CardContent>
        </Card>
      )}

      {/* View-mode toggle: Guard rows vs Site rows. Same shift data either
          way; the row dimension and the card title swap. */}
      <div className="mb-3 inline-flex rounded-md border bg-background p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setView("guard")}
          className={cn(
            "px-3 py-1.5 rounded",
            viewMode === "guard"
              ? "bg-brand-navy text-white font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          By Guard
        </button>
        <button
          type="button"
          onClick={() => setView("site")}
          className={cn(
            "px-3 py-1.5 rounded",
            viewMode === "site"
              ? "bg-brand-navy text-white font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          By Site
        </button>
      </div>

      <Card className="mb-4">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[900px]">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left p-2 border-b w-40 sticky left-0 bg-muted/40 z-10">{rowHeading}</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="text-left p-2 border-b border-l">
                    <div>{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div className="text-muted-foreground">{d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No shifts yet — click <em>Add Shift</em> to start.</td></tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="p-2 border-b font-medium sticky left-0 bg-background z-10">{row.label}</td>
                  {days.map((d) => {
                    const cellShifts = shiftsForRowDay(row.id, d);
                    return (
                      <td key={d.toISOString()} className="p-1 border-b border-l align-top">
                        <div className="flex flex-col gap-1">
                          {cellShifts.map((s) => {
                            // Card title shows the OTHER dimension: site name in
                            // Guard view, guard name in Site view (so each card
                            // tells you what's missing from the row label).
                            const cardTitle = viewMode === "guard"
                              ? s.site.name
                              : s.guard
                                ? `${s.guard.firstName} ${s.guard.lastName}`
                                : "Unassigned";
                            return (
                              <div
                                key={s.id}
                                className={cn(
                                  "rounded border hover:shadow-sm transition-shadow relative",
                                  statusCellClass(s.status),
                                  conflicts.has(s.id) && "ring-2 ring-amber-500",
                                )}
                              >
                                <button
                                  onClick={() => openEdit(s)}
                                  className="text-left w-full px-2 py-1 pr-7"
                                >
                                  <div className="font-medium truncate">{cardTitle}</div>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-muted-foreground">{fmtTime(s.startAt)}–{fmtTime(s.endAt)}</span>
                                    <StatusBadge status={s.status} />
                                  </div>
                                  {s.role && <div className="text-[10px] text-muted-foreground">{s.role}</div>}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); publishSingle(s); }}
                                  title={s.publishedAt ? "Resend SMS" : "Publish (send SMS)"}
                                  aria-label={s.publishedAt ? "Resend SMS" : "Publish shift"}
                                  className={cn(
                                    "absolute top-1 right-1 rounded p-0.5 hover:bg-white/60",
                                    s.publishedAt ? "text-emerald-700" : "text-blue-700",
                                  )}
                                >
                                  {s.publishedAt
                                    ? <RefreshCcw className="h-3 w-3" />
                                    : <Send className="h-3 w-3" />}
                                </button>
                              </div>
                            );
                          })}
                          <button
                            onClick={() => openNewShift(
                              viewMode === "guard"
                                ? { guardId: row.id, day: d }
                                : { siteId: row.id, day: d },
                            )}
                            className="text-[10px] text-muted-foreground hover:text-foreground border border-dashed rounded px-1 py-0.5"
                          >
                            + add
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ShiftFormDialog
        open={shiftOpen}
        onOpenChange={setShiftOpen}
        rosterId={id}
        initial={
          editing
            ? {
                id: editing.id,
                guardId: editing.guardId ?? undefined,
                siteId: editing.siteId,
                startAt: editing.startAt,
                endAt: editing.endAt,
                role: editing.role,
                notes: editing.notes,
                status: editing.status,
              }
            : {
                guardId: presetGuardId,
                siteId: presetSiteId,
                startAt: presetStart,
                endAt: presetStart ? new Date(presetStart.getTime() + 8 * 3600_000) : undefined,
              }
        }
        onSaved={() => qc.invalidateQueries({ queryKey: ["roster", id] })}
        onDeleted={() => qc.invalidateQueries({ queryKey: ["roster", id] })}
      />
    </>
  );
}
