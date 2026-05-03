"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";

interface FormValues {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  licenceNumber?: string;
  licenceExpiry?: string;
  payRate?: string;
  notes?: string;
  active?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<FormValues> & { id?: string };
  onSaved?: () => void;
}

export function GuardFormDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<FormValues>({
    defaultValues: { active: true, ...initial },
  });
  const { toast } = useToast();

  React.useEffect(() => {
    if (open) reset({ active: true, ...initial });
  }, [open, initial, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        ...values,
        payRate: values.payRate ? Number(values.payRate) : undefined,
      };
      if (initial?.id) {
        await api(`/api/guards/${initial.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "Guard updated", variant: "success" });
      } else {
        await api(`/api/guards`, { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Guard created", variant: "success" });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit guard" : "Add guard"}</DialogTitle>
          <DialogDescription>Phone numbers must be E.164 (e.g. +61412345678).</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First name</Label>
              <Input {...register("firstName", { required: true })} />
            </div>
            <div className="space-y-1">
              <Label>Last name</Label>
              <Input {...register("lastName", { required: true })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Phone (E.164)</Label>
            <Input placeholder="+61412345678" {...register("phone", { required: true, pattern: /^\+\d{8,15}$/ })} />
            {errors.phone && <p className="text-xs text-destructive">Must be E.164 format.</p>}
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" {...register("email")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Licence #</Label>
              <Input {...register("licenceNumber")} />
            </div>
            <div className="space-y-1">
              <Label>Licence expiry</Label>
              <Input type="date" {...register("licenceExpiry")} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Pay rate ($/hr)</Label>
            <Input type="number" step="0.01" {...register("payRate")} />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} {...register("notes")} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("active")} /> Active
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{initial?.id ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
