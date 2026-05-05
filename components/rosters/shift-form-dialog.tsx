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
  }, [open, initial, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload: Record<string, unknown> = {
        rosterId,
        guardId: values.guardId,
        siteId: values.siteId,
        startAt: localInputToUtc(values.startAt).toISOString(),
        endAt: localInputToUtc(values.endAt).toISOString(),
        role: values.role || undefined,
        notes: values.notes || undefined,
      };
      if (isEdit) {
        if (values.status) payload.status = values.status;
        await api(`/api/shifts/${initial!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "Shift updated", variant: "success" });
      } else {
        const created = await api<{ sms?: { sent: boolean; error?: string } }>(`/api/shifts`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (created.sms?.sent) {
          toast({ title: "Shift created — SMS sent to guard", variant: "success" });
        } else if (created.sms?.error) {
          toast({ title: "Shift created — SMS failed", description: created.sms.error, variant: "error" });
        } else {
          toast({ title: "Shift created", variant: "success" });
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
        <DialogHeader><DialogTitle>{isEdit ? "Edit shift" : "Add shift"}</DialogTitle></DialogHeader>
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
            <Button type="submit" disabled={isSubmitting}>{isEdit ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
