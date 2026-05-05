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

interface SmsResult { sent: boolean; error?: string }
interface CreateResp {
  count: number;
  sentCount: number;
  failedCount: number;
  sms: (SmsResult & { guardId: string })[];
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

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>();

  // Multi-guard selection used only for create. Edit mode keeps a single
  // guard id in the form state since one shift = one guard in the schema.
  const [guardIds, setGuardIds] = React.useState<string[]>([]);
  const [guardFilter, setGuardFilter] = React.useState("");

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
    setGuardIds(initial?.guardId ? [initial.guardId] : []);
    setGuardFilter("");
  }, [open, initial, reset]);

  const filteredGuards = React.useMemo(() => {
    const q = guardFilter.trim().toLowerCase();
    if (!q) return guards;
    return guards.filter((g) => `${g.firstName} ${g.lastName}`.toLowerCase().includes(q));
  }, [guards, guardFilter]);

  function toggleGuard(id: string) {
    setGuardIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAllVisible() {
    setGuardIds((prev) => Array.from(new Set([...prev, ...filteredGuards.map((g) => g.id)])));
  }

  function clearAll() {
    setGuardIds([]);
  }

  const onSubmit = async (values: FormValues) => {
    try {
      const basePayload = {
        rosterId,
        siteId: values.siteId,
        startAt: localInputToUtc(values.startAt).toISOString(),
        endAt: localInputToUtc(values.endAt).toISOString(),
        role: values.role || undefined,
        notes: values.notes || undefined,
      };

      if (isEdit) {
        const payload: Record<string, unknown> = { ...basePayload, guardId: values.guardId };
        if (values.status) payload.status = values.status;
        await api(`/api/shifts/${initial!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "Shift updated", variant: "success" });
      } else {
        if (guardIds.length === 0) {
          toast({ title: "Pick at least one guard", variant: "error" });
          return;
        }
        const payload = { ...basePayload, guardIds };
        const created = await api<CreateResp>(`/api/shifts`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const total = created.count;
        if (created.sms.length === 0) {
          toast({ title: total === 1 ? "Shift created" : `Created ${total} shifts`, variant: "success" });
        } else if (created.failedCount === 0) {
          toast({
            title: total === 1
              ? "Shift created — SMS sent"
              : `Created ${total} shifts — SMS sent to all ${created.sentCount} guards`,
            variant: "success",
          });
        } else {
          const failed = created.sms.filter((s) => !s.sent);
          toast({
            title: `Created ${total} shifts — ${created.sentCount} SMS sent, ${created.failedCount} failed`,
            description: failed.map((f) => f.error ?? "send failed").join("\n"),
            variant: "error",
          });
        }
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit shift" : "Add shift"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {isEdit ? (
            <div className="space-y-1">
              <Label>Guard</Label>
              <Select {...register("guardId", { required: true })}>
                <option value="">Select guard…</option>
                {guards.map((g) => (
                  <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <Label>Guards</Label>
                <span className="text-xs text-muted-foreground">
                  {guardIds.length} selected — one shift will be created per guard
                </span>
              </div>
              <Input
                placeholder="Filter by name"
                value={guardFilter}
                onChange={(e) => setGuardFilter(e.target.value)}
              />
              <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                {filteredGuards.length === 0 && (
                  <div className="text-sm text-muted-foreground p-3">No matching guards.</div>
                )}
                {filteredGuards.map((g) => {
                  const checked = guardIds.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGuard(g.id)}
                      />
                      <span>{g.firstName} {g.lastName}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex gap-2 text-xs">
                <Button type="button" variant="outline" size="sm" onClick={selectAllVisible}>
                  Select all{guardFilter ? " (filtered)" : ""}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearAll}>
                  Clear
                </Button>
              </div>
            </div>
          )}

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
            <Button type="submit" disabled={isSubmitting}>
              {isEdit ? "Save" : guardIds.length > 1 ? `Create ${guardIds.length} shifts` : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
