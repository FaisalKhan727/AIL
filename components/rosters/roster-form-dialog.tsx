"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { startOfWeekMon, endOfWeekSun, fmtIso } from "@/lib/date";

interface FormValues {
  name: string;
  startDate: string;
  endDate: string;
}

export function RosterFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const today = new Date();
  const start = fmtIso(startOfWeekMon(today));
  const end = fmtIso(endOfWeekSun(today));

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: `Week of ${start}`, startDate: start, endDate: end },
  });
  React.useEffect(() => { if (open) reset({ name: `Week of ${start}`, startDate: start, endDate: end }); }, [open, reset, start, end]);

  const onSubmit = async (values: FormValues) => {
    try {
      const r = await api<{ id: string }>(`/api/rosters`, { method: "POST", body: JSON.stringify(values) });
      toast({ title: "Roster created", variant: "success" });
      onOpenChange(false);
      router.push(`/rosters/${r.id}`);
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New roster</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input {...register("name", { required: true })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Start date</Label><Input type="date" {...register("startDate", { required: true })} /></div>
            <div className="space-y-1"><Label>End date</Label><Input type="date" {...register("endDate", { required: true })} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
