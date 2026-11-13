"use client";
import * as React from "react";
import { Paperclip } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fileToDataUrl } from "@/lib/file-to-dataurl";
import { LICENCE_TYPES, STATES, licenceType, registerFor } from "@/lib/licences";

export interface LicenceFormInitial {
  id?: string;
  guardId?: string;
  type?: string;
  number?: string;
  state?: string;
  issueDate?: string | null;
  expiryDate?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  guards: { id: string; name: string }[];
  /** Lock the guard (when opened from a guard's own page). */
  fixedGuardId?: string;
  initial?: LicenceFormInitial;
  onSaved?: () => void;
}

const EMPTY = { guardId: "", type: "SECURITY_1A", number: "", state: "VIC", issueDate: "", expiryDate: "" };

export function LicenceFormDialog({ open, onOpenChange, guards, fixedGuardId, initial, onSaved }: Props) {
  const { toast } = useToast();
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = React.useState(EMPTY);
  const [doc, setDoc] = React.useState<{ name: string; dataUrl: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Reset only when the dialog opens (the parent re-renders on every poll).
  const initialRef = React.useRef(initial);
  React.useEffect(() => { initialRef.current = initial; });
  React.useEffect(() => {
    if (!open) return;
    const i = initialRef.current;
    setForm({
      guardId: i?.guardId ?? fixedGuardId ?? "",
      type: i?.type ?? "SECURITY_1A",
      number: i?.number ?? "",
      state: i?.state ?? "VIC",
      issueDate: i?.issueDate ?? "",
      expiryDate: i?.expiryDate ?? "",
    });
    setDoc(null);
  }, [open, fixedGuardId]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const def = licenceType(form.type);
  const hint = def.security ? registerFor(form.state).formatHint : null;

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setDoc(await fileToDataUrl(file));
    } catch (err) {
      toast({ title: "Couldn't attach file", description: err instanceof Error ? err.message : "", variant: "error" });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        number: form.number,
        state: form.state,
        issueDate: form.issueDate,
        expiryDate: form.expiryDate,
        ...(doc ? { document: doc } : {}),
      };
      if (isEdit) {
        await api(`/api/licences/${initial!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "Licence updated", variant: "success" });
      } else {
        await api(`/api/licences`, { method: "POST", body: JSON.stringify({ ...payload, guardId: form.guardId }) });
        toast({ title: "Licence added", description: "It's in the verification queue.", variant: "success" });
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast({ title: "Couldn't save", description: err instanceof Error ? err.message : "", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit licence" : "Add licence"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Changing the number, state, type or expiry sends the licence back for verification."
              : "New licences start unverified until someone checks them."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {!isEdit && (
            <div className="space-y-1">
              <Label htmlFor="lic-guard">Guard</Label>
              <Select id="lic-guard" value={form.guardId} onChange={set("guardId")} required disabled={Boolean(fixedGuardId)}>
                <option value="">Select guard…</option>
                {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="lic-type">Credential</Label>
            <Select id="lic-type" value={form.type} onChange={set("type")}>
              {LICENCE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_6.5rem] gap-3">
            <div className="space-y-1">
              <Label htmlFor="lic-number">Number</Label>
              <Input id="lic-number" className="font-mono" value={form.number} onChange={set("number")} required placeholder={hint ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lic-state">State</Label>
              <Select id="lic-state" value={form.state} onChange={set("state")}>
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lic-issue">Issued</Label>
              <Input id="lic-issue" type="date" value={form.issueDate} onChange={set("issueDate")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lic-expiry">Expires{def.expires ? "" : " (optional)"}</Label>
              <Input id="lic-expiry" type="date" value={form.expiryDate} onChange={set("expiryDate")} required={def.expires} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Photo or scan</Label>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground hover:bg-muted/40">
              <Paperclip className="h-4 w-4 shrink-0" />
              <span className="truncate">{doc ? doc.name : isEdit ? "Replace document…" : "Attach JPG, PNG or PDF (2 MB max)"}</span>
              <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={pickFile} />
            </label>
          </div>
          <DialogFooter className="dialog-footer-sticky">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save" : "Add licence"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
