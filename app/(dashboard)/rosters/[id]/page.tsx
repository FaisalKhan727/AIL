"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, RefreshCcw, AlertTriangle } from "lucide-react";
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
  guardId: string;
  siteId: string;
  startAt: string;
  endAt: string;
  status: string;
  role: string | null;
  notes: string | null;
  guard: { id: string; firstName: string; lastName: string };
  site: { id: string; name: string };
}

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
  const qc = useQueryClient();
  const { toast } = useToast();
  const [shiftOpen, setShiftOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Shift | null>(null);
  const [presetGuardId, setPresetGuardId] = React.useState<string | undefined>();
  const [presetStart, setPresetStart] = React.useState<Date | undefined>();

  const { data, refetch } = useQuery<Roster>({
    queryKey: ["roster", id],
    queryFn: () => api(`/api/rosters/${id}`),
    refetchInterval: 5000, // live status updates
  });

  if (!data) return <div className="text-muted-foreground">Loading…</div>;

  const start = new Date(data.startDate);
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const guardMap = new Map<string, { id: string; firstName: string; lastName: string }>();
  for (const s of data.shifts) guardMap.set(s.guardId, s.guard);
  const guardList = Array.from(guardMap.values()).sort((a, b) => a.lastName.localeCompare(b.lastName));

  const conflicts = detectConflicts(data.shifts);

  const totalCounts = data.shifts.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  async function publish() {
    try {
      const r = await api<{ ok: boolean; sent: number }>(`/api/rosters/${id}/publish`, { method: "POST" });
      toast({ title: `Published — sent ${r.sent} SMS (mock)`, variant: "success" });
      refetch();
    } catch (e: unknown) {
      toast({ title: "Publish failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function resendAll() {
    try {
      const r = await api<{ sent: number }>(`/api/rosters/${id}/resend`, { method: "POST" });
      toast({ title: `Re-sent ${r.sent} SMS (mock)`, variant: "success" });
    } catch (e: unknown) {
      toast({ title: "Resend failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  function openNewShift(guardId?: string, day?: Date) {
    setEditing(null);
    setPresetGuardId(guardId);
    if (day) {
      const d = new Date(day);
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
    setPresetStart(undefined);
    setShiftOpen(true);
  }

  return (
    <>
      <PageHeader
        title={data.name}
        description={`${data.shifts.length} shifts · ${totalCounts.CONFIRMED ?? 0} confirmed · ${totalCounts.PENDING ?? 0} pending · ${totalCounts.REJECTED ?? 0} rejected`}
        actions={
          <>
            <Button variant="outline" onClick={() => openNewShift()}><Plus className="h-4 w-4" /> Add Shift</Button>
            {data.status === "PUBLISHED" ? (
              <Button variant="outline" onClick={resendAll}><RefreshCcw className="h-4 w-4" /> Resend all</Button>
            ) : (
              <Button onClick={publish} disabled={data.shifts.length === 0}><Send className="h-4 w-4" /> Publish</Button>
            )}
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

      <Card className="mb-4">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[900px]">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left p-2 border-b w-40 sticky left-0 bg-muted/40 z-10">Guard</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="text-left p-2 border-b border-l">
                    <div>{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div className="text-muted-foreground">{d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guardList.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No shifts yet — click <em>Add Shift</em> to start.</td></tr>
              )}
              {guardList.map((g) => (
                <tr key={g.id} className="align-top">
                  <td className="p-2 border-b font-medium sticky left-0 bg-background z-10">{g.firstName} {g.lastName}</td>
                  {days.map((d) => {
                    const dayStr = d.toDateString();
                    const cellShifts = data.shifts.filter((s) => s.guardId === g.id && new Date(s.startAt).toDateString() === dayStr);
                    return (
                      <td key={d.toISOString()} className="p-1 border-b border-l align-top">
                        <div className="flex flex-col gap-1">
                          {cellShifts.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => openEdit(s)}
                              className={cn(
                                "text-left rounded border px-2 py-1 hover:shadow-sm transition-shadow",
                                statusCellClass(s.status),
                                conflicts.has(s.id) && "ring-2 ring-amber-500",
                              )}
                            >
                              <div className="font-medium truncate">{s.site.name}</div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-muted-foreground">{fmtTime(s.startAt)}–{fmtTime(s.endAt)}</span>
                                <StatusBadge status={s.status} />
                              </div>
                              {s.role && <div className="text-[10px] text-muted-foreground">{s.role}</div>}
                            </button>
                          ))}
                          <button onClick={() => openNewShift(g.id, d)} className="text-[10px] text-muted-foreground hover:text-foreground border border-dashed rounded px-1 py-0.5">
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
                guardId: editing.guardId,
                siteId: editing.siteId,
                startAt: editing.startAt,
                endAt: editing.endAt,
                role: editing.role,
                notes: editing.notes,
                status: editing.status,
              }
            : { guardId: presetGuardId, startAt: presetStart, endAt: presetStart ? new Date(presetStart.getTime() + 8 * 3600_000) : undefined }
        }
        onSaved={() => qc.invalidateQueries({ queryKey: ["roster", id] })}
        onDeleted={() => qc.invalidateQueries({ queryKey: ["roster", id] })}
      />
    </>
  );
}
