"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";

interface FormValues {
  name: string;
  address: string;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
  active?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<FormValues> & { id?: string };
  onSaved?: () => void;
}

export function SiteFormDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { active: true, ...initial },
  });
  const { toast } = useToast();
  React.useEffect(() => { if (open) reset({ active: true, ...initial }); }, [open, initial, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (initial?.id) {
        await api(`/api/sites/${initial.id}`, { method: "PATCH", body: JSON.stringify(values) });
        toast({ title: "Site updated", variant: "success" });
      } else {
        await api(`/api/sites`, { method: "POST", body: JSON.stringify(values) });
        toast({ title: "Site created", variant: "success" });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial?.id ? "Edit site" : "Add site"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input {...register("name", { required: true })} /></div>
          <div className="space-y-1"><Label>Address</Label><Input {...register("address", { required: true })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Contact name</Label><Input {...register("contactName")} /></div>
            <div className="space-y-1"><Label>Contact phone</Label><Input {...register("contactPhone")} /></div>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} {...register("notes")} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("active")} /> Active</label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{initial?.id ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
