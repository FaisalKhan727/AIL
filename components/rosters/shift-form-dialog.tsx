"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { utcToLocalInput, localInputToUtc } from "@/lib/date";
import { cn } from "@/lib/utils";

interface FormValues {
  guardId: string;
  siteId: string;
  startAt: string;
  endAt: string;
  role?: string;
  notes?: string;
  status?: string;
}

interface Initial {
  id?: string;
  guardId?: string;
  siteId?: string;
  startAt?: string | Date;
  endAt?: string | Date;
  role?: string | null;
  notes?: string | null;
  status?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rosterId: string;
  initial?: Initial;
  onSaved?: () => void;
  onDeleted?: () => void;
}

interface CreateResp {
  count: number;
}

const DOW_LABELS: { code: string; label: string; jsDay: number }[] = [
  { code: "MON", label: "Mon", jsDay: 1 },
  { code: "TUE", label: "Tue", jsDay: 2 },
  { code: "WED", label: "Wed", jsDay: 3 },
  { code: "THU", label: "Thu", jsDay: 4 },
  { code: "FRI", label: "Fri", jsDay: 5 },
  { code: "SAT", label: "Sat", jsDay: 6 },
  { code: "SUN", label: "Sun", jsDay: 0 },
];

function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function previewOccurrenceCount(
  baseStartLocal: string,
  daysOfWeek: string[],
  untilDate: string,
): number {
  if (!baseStartLocal || !untilDate || daysOfWeek.length === 0) return 0;
  const startDate = new Date(baseStartLocal);
  if (Number.isNaN(startDate.getTime())) return 0;
  const [uy, um, ud] = untilDate.split("-").map(Number);
  const until = new Date(uy, um - 1, ud);
  if (until.getTime() < startDate.getTime()) return 0;

  const codes = new Set(
    DOW_LABELS.filter((d) => daysOfWeek.includes(d.code)).map((d) => d.jsDay),
  );
  let count = 0;
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  while (cursor.getTime() <= until.getTime()) {
    if (codes.has(cursor.getDay())) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function ShiftFormDialog({ open, onOpenChange, rosterId, initial, onSaved, onDeleted }: Props) {
  const { toast } = useToast();
  const isEdit = Boolean(initial?.id);

  const { data: guards = [] } = useQuery<{ id: string; firstName: string; lastName: string; active: boolean }[]>({
    queryKey: ["guards", "active"],
    queryFn: () => api(`/api/guards?active=true`),
    enabled: open,
  });
  const { data: sites = [] } = useQuery<{ id: string; name: string; active: boolean }[]>({
    queryKey: ["sites", "all"],
    queryFn: () => api(`/api/sites`),
    enabled: open,
  });

  const { register, handleSubmit, watch, getValues, reset, formState: { isSubmitting } } = useForm<FormValues>();

  // Recurrence state (create mode only).
  const [recurEnabled, setRecurEnabled] = React.useState(false);
  const [recurDays, setRecurDays] = React.useState<string[]>([]);
  const [recurUntil, setRecurUntil] = React.useState<string>("");

  // Duplicate state (edit mode only).
  const [duplicateDate, setDuplicateDate] = React.useState<string>("");

  React.useEffect(() => {
    if (!open) return;
    reset({
      guardId: initial?.guardId ?? "",
      siteId: initial?.siteId ?? "",
      startAt: initial?.startAt ? utcToLocalInput(typeof initial.startAt === "string" ? new Date(initial.startAt) : initial.startAt) : "",
      endAt: initial?.endAt ? utcToLocalInput(typeof initial.endAt === "string" ? new Date(initial.endAt) : initial.endAt) : "",
      role: initial?.role ?? "",
      notes: initial?.notes ?? "",
      status: initial?.status ?? "PENDING",
    });
    setRecurEnabled(false);
    setRecurDays([]);
    setRecurUntil("");
    setDuplicateDate("");
  }, [open, initial, reset]);

  // When the user edits the start date and recurrence is on, default the
  // selected day-of-week to that day so the toggle group has a sane initial
  // pick. They can add more days from there.
  const watchStartAt = watch("startAt");
  React.useEffect(() => {
    if (!recurEnabled || !watchStartAt || recurDays.length > 0) return;
    const d = new Date(watchStartAt);
    if (Number.isNaN(d.getTime())) return;
    const code = DOW_LABELS.find((x) => x.jsDay === d.getDay())?.code;
    if (code) setRecurDays([code]);
    if (!recurUntil) {
      const four = new Date(d.getTime());
      four.setDate(four.getDate() + 28);
      setRecurUntil(dateToYmd(four));
    }
  }, [recurEnabled, watchStartAt, recurDays.length, recurUntil]);

  const previewCount = previewOccurrenceCount(watchStartAt, recurDays, recurUntil);

  function toggleRecurDay(code: string) {
    setRecurDays((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  }

  const onSubmit = async (values: FormValues) => {
    try {
      const basePayload = {
        rosterId,
        guardId: values.guardId,
        siteId: values.siteId,
        startAt: localInputToUtc(values.startAt).toISOString(),
        endAt: localInputToUtc(values.endAt).toISOString(),
        role: values.role || undefined,
        notes: values.notes || undefined,
      };

      if (isEdit) {
        const payload: Record<string, unknown> = { ...basePayload };
        if (values.status) payload.status = values.status;
        await api(`/api/shifts/${initial!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "Shift updated", variant: "success" });
      } else {
        const recurrence = recurEnabled && recurDays.length > 0 && recurUntil
          ? { daysOfWeek: recurDays, untilDate: recurUntil }
          : undefined;
        const payload = recurrence ? { ...basePayload, recurrence } : basePayload;
        const created = await api<CreateResp>(`/api/shifts`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({
          title: created.count === 1
            ? "Shift created"
            : `Created ${created.count} shifts`,
          variant: "success",
        });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  async function handleDuplicate() {
    if (!duplicateDate) return;
    try {
      const v = getValues();
      const origStart = localInputToUtc(v.startAt);
      const origEnd = localInputToUtc(v.endAt);
      const duration = origEnd.getTime() - origStart.getTime();
      // Replace the date portion of the start datetime, preserving time-of-day.
      const newStartLocal = `${duplicateDate}T${v.startAt.split("T")[1] ?? "00:00"}`;
      const newStart = localInputToUtc(newStartLocal);
      const newEnd = new Date(newStart.getTime() + duration);

      const payload = {
        rosterId,
        guardId: v.guardId,
        siteId: v.siteId,
        startAt: newStart.toISOString(),
        endAt: newEnd.toISOString(),
        role: v.role || undefined,
        notes: v.notes || undefined,
      };
      await api(`/api/shifts`, { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "Shift duplicated", variant: "success" });
      setDuplicateDate("");
      onSaved?.();
    } catch (e: unknown) {
      toast({ title: "Duplicate failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function onDelete() {
    if (!initial?.id || !confirm("Delete this shift?")) return;
    try {
      await api(`/api/shifts/${initial.id}`, { method: "DELETE" });
      toast({ title: "Shift deleted", variant: "success" });
      onOpenChange(false);
      onDeleted?.();
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function onResend() {
    if (!initial?.id) return;
    try {
      await api(`/api/shifts/${initial.id}/resend`, { method: "POST" });
      toast({ title: "SMS sent", variant: "success" });
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  const submitLabel = isEdit
    ? "Save"
    : recurEnabled && previewCount > 1
      ? `Create ${previewCount} shifts`
      : "Create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit shift" : "Add shift"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>Guard</Label>
            <Select {...register("guardId", { required: true })}>
              <option value="">Select guard…</option>
              {guards.map((g) => (
                <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Site</Label>
            <Select {...register("siteId", { required: true })}>
              <option value="">Select site…</option>
              {sites.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Start</Label><Input type="datetime-local" {...register("startAt", { required: true })} /></div>
            <div className="space-y-1"><Label>End</Label><Input type="datetime-local" {...register("endAt", { required: true })} /></div>
          </div>

          <div className="space-y-1"><Label>Role</Label><Input placeholder="Static, Patrol, Crowd…" {...register("role")} /></div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} {...register("notes")} /></div>

          {!isEdit && (
            <div className="border rounded-md p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={recurEnabled}
                  onChange={(e) => setRecurEnabled(e.target.checked)}
                />
                Repeat this shift
              </label>
              {recurEnabled && (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1">
                    <Label>Repeat on</Label>
                    <div className="flex gap-1 flex-wrap">
                      {DOW_LABELS.map((d) => (
                        <button
                          type="button"
                          key={d.code}
                          onClick={() => toggleRecurDay(d.code)}
                          className={cn(
                            "rounded border px-3 py-1 text-xs",
                            recurDays.includes(d.code)
                              ? "bg-blue-50 border-blue-300 text-blue-800"
                              : "bg-background",
                          )}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Until</Label>
                    <Input type="date" value={recurUntil} onChange={(e) => setRecurUntil(e.target.value)} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {previewCount > 0
                      ? `Will create ${previewCount} shift${previewCount === 1 ? "" : "s"} (one per matching weekday from the start date through Until).`
                      : "Pick at least one weekday and an Until date."}
                  </p>
                </div>
              )}
            </div>
          )}

          {isEdit && (
            <div className="border rounded-md p-3 space-y-2">
              <div className="text-sm font-medium">Duplicate to another date</div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={duplicateDate}
                  onChange={(e) => setDuplicateDate(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleDuplicate} disabled={!duplicateDate}>
                  Duplicate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Creates a new shift on the chosen date with the same guard, site, time of day, and duration. Use Repeat (in a new shift) to create many at once.
              </p>
            </div>
          )}

          {isEdit && (
            <div className="space-y-1">
              <Label>Status</Label>
              <Select {...register("status")}>
                {["PENDING", "CONFIRMED", "REJECTED", "WORKED", "NO_SHOW", "CANCELLED"].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          )}

          <DialogFooter className="flex-row sm:flex-row gap-2">
            {isEdit && (
              <>
                <Button type="button" variant="outline" onClick={onResend}>Resend SMS</Button>
                <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button>
              </>
            )}
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
