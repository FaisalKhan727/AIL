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

  // Multi-guard state (create mode only). When ON, the single guardId
  // dropdown is hidden and a checkbox list takes over. Submit then POSTs
  // guardIds[] to /api/shifts (already supported by the batch handler).
  const [multiGuardEnabled, setMultiGuardEnabled] = React.useState(false);
  const [selectedGuardIds, setSelectedGuardIds] = React.useState<Set<string>>(new Set());
  const [guardFilter, setGuardFilter] = React.useState("");

  // Reset the form ONLY when the dialog opens. The parent (rosters page)
  // polls every 10s and rebuilds a new `initial` object literal on every
  // render, so depending on `initial` here would wipe the user's typed
  // values on every poll cycle — exactly what looked like "everything
  // disappears after I pick the date".
  // We use a ref to capture the latest `initial` so the values used at the
  // moment of opening are correct, but reference changes don't re-run.
  const initialRef = React.useRef(initial);
  React.useEffect(() => { initialRef.current = initial; });
  React.useEffect(() => {
    if (!open) return;
    const i = initialRef.current;
    reset({
      guardId: i?.guardId ?? "",
      siteId: i?.siteId ?? "",
      startAt: i?.startAt ? utcToLocalInput(typeof i.startAt === "string" ? new Date(i.startAt) : i.startAt) : "",
      endAt: i?.endAt ? utcToLocalInput(typeof i.endAt === "string" ? new Date(i.endAt) : i.endAt) : "",
      role: i?.role ?? "",
      notes: i?.notes ?? "",
      status: i?.status ?? "PENDING",
    });
    setRecurEnabled(false);
    setRecurDays([]);
    setRecurUntil("");
    setDuplicateDate("");
    setMultiGuardEnabled(false);
    setSelectedGuardIds(i?.guardId ? new Set([i.guardId]) : new Set());
    setGuardFilter("");
  }, [open, reset]);

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
      const sharedFields = {
        rosterId,
        siteId: values.siteId,
        startAt: localInputToUtc(values.startAt).toISOString(),
        endAt: localInputToUtc(values.endAt).toISOString(),
        role: values.role || undefined,
        notes: values.notes || undefined,
      };

      if (isEdit) {
        const payload: Record<string, unknown> = {
          ...sharedFields,
          guardId: values.guardId,
        };
        if (values.status) payload.status = values.status;
        await api(`/api/shifts/${initial!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "Shift updated", variant: "success" });
      } else if (multiGuardEnabled) {
        // Multi-guard: POST guardIds[] to the batch handler. Backend creates
        // one Shift row per guardId. Recurrence is intentionally ignored in
        // multi-guard mode (backend constraint).
        const guardIds = Array.from(selectedGuardIds);
        if (guardIds.length === 0) {
          toast({ title: "Select at least one guard", variant: "error" });
          return;
        }
        const payload = { ...sharedFields, guardIds };
        const created = await api<CreateResp>(`/api/shifts`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({
          title: created.count === 1
            ? "Shift created"
            : `Created ${created.count} shifts (one per guard)`,
          variant: "success",
        });
      } else {
        // Single guard with optional recurrence — existing behaviour.
        const basePayload = { ...sharedFields, guardId: values.guardId };
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
    : multiGuardEnabled
      ? selectedGuardIds.size > 1
        ? `Create ${selectedGuardIds.size} shifts`
        : selectedGuardIds.size === 1
          ? "Create"
          : "Select guards"
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
            <div className="flex items-center justify-between">
              <Label>{multiGuardEnabled ? `Guards (${selectedGuardIds.size} selected)` : "Guard"}</Label>
              {!isEdit && (
                <label className="text-xs flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multiGuardEnabled}
                    onChange={(e) => {
                      setMultiGuardEnabled(e.target.checked);
                      if (!e.target.checked) {
                        // Switching back to single — clear multi-selection.
                        setSelectedGuardIds(new Set());
                      }
                    }}
                  />
                  Assign to multiple guards
                </label>
              )}
            </div>
            {!multiGuardEnabled && (
              <Select {...register("guardId", { required: !multiGuardEnabled })}>
                <option value="">Select guard…</option>
                {guards.map((g) => (
                  <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>
                ))}
              </Select>
            )}
            {multiGuardEnabled && (
              <div className="border rounded-md">
                <Input
                  type="text"
                  placeholder="Filter guards…"
                  value={guardFilter}
                  onChange={(e) => setGuardFilter(e.target.value)}
                  className="border-0 border-b rounded-none focus-visible:ring-0"
                />
                <div className="max-h-48 overflow-y-auto p-1">
                  {(() => {
                    const filter = guardFilter.trim().toLowerCase();
                    const visible = filter
                      ? guards.filter((g) =>
                          `${g.firstName} ${g.lastName}`.toLowerCase().includes(filter),
                        )
                      : guards;
                    if (visible.length === 0) {
                      return (
                        <p className="text-xs text-muted-foreground p-2">
                          No guards match &quot;{guardFilter}&quot;.
                        </p>
                      );
                    }
                    return visible.map((g) => {
                      const checked = selectedGuardIds.has(g.id);
                      return (
                        <label
                          key={g.id}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-muted/60",
                            checked && "bg-blue-50",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedGuardIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(g.id);
                                else next.delete(g.id);
                                return next;
                              });
                            }}
                          />
                          <span className="flex-1">{g.firstName} {g.lastName}</span>
                        </label>
                      );
                    });
                  })()}
                </div>
                {selectedGuardIds.size > 0 && (
                  <div className="border-t px-2 py-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{selectedGuardIds.size} selected</span>
                    <button
                      type="button"
                      onClick={() => setSelectedGuardIds(new Set())}
                      className="text-blue-600 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}
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

          {!isEdit && !multiGuardEnabled && (
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

          <DialogFooter className="dialog-footer-sticky flex flex-wrap gap-2 sm:flex-row sm:flex-nowrap sm:justify-end">
            {isEdit && (
              <>
                <Button type="button" variant="outline" onClick={onResend}>Resend SMS</Button>
                <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button>
              </>
            )}
            <div className="hidden sm:block flex-1" />
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 sm:flex-none">
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
