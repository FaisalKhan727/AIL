"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fileToDataUrl } from "@/lib/file-to-dataurl";
import { LICENCE_TYPES, STATES, licenceType, type LicenceStatus } from "@/lib/licences";
import { LicenceStatusBadge, auDate, daysLabel } from "@/components/compliance/licence-status";

interface Lic {
  id: string;
  typeLabel: string;
  number: string;
  state: string;
  expiryDate: string | null;
  daysLeft: number | null;
  status: LicenceStatus;
  verification: string;
  source: string;
  verifyNote: string | null;
  document: { uploadedAt: string } | null;
}

const EMPTY = { type: "SECURITY_1A", number: "", state: "VIC", issueDate: "", expiryDate: "" };

export default function GuardLicences() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Lic[]>({ queryKey: ["m-licences"], queryFn: () => api(`/api/m/licences`) });
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY);
  const [doc, setDoc] = React.useState<{ name: string; dataUrl: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function openForm() {
    setForm(EMPTY);
    setDoc(null);
    setOpen(true);
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setDoc(await fileToDataUrl(file));
    } catch (err) {
      toast({ title: "Couldn't use that file", description: err instanceof Error ? err.message : "", variant: "error" });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!doc) {
      toast({ title: "Add a photo", description: "The office needs to see the licence to verify it.", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      await api(`/api/m/licences`, { method: "POST", body: JSON.stringify({ ...form, document: doc }) });
      toast({ title: "Sent to the office", description: "You'll be cleared once it's verified.", variant: "success" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["m-licences"] });
      qc.invalidateQueries({ queryKey: ["m-me"] });
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(l: Lic) {
    if (!confirm("Remove this upload?")) return;
    try {
      await api(`/api/m/licences/${l.id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["m-licences"] });
      qc.invalidateQueries({ queryKey: ["m-me"] });
    } catch (err) {
      toast({ title: "Couldn't remove", description: err instanceof Error ? err.message : "", variant: "error" });
    }
  }

  const def = licenceType(form.type);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold">Licences</h1>
        <Button size="sm" onClick={openForm}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload renewals here as soon as you have them. The office checks each one before you&apos;re cleared to work on it.
      </p>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {data && data.length === 0 && (
        <button onClick={openForm} className="w-full rounded-[10px] border border-dashed p-6 text-center text-sm text-muted-foreground hover:bg-muted/30">
          Nothing on file yet. Tap to add your security licence.
        </button>
      )}

      <ul className="space-y-3">
        {data?.map((l) => (
          <li key={l.id} className="rounded-[10px] border bg-card p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium leading-snug">{l.typeLabel}</div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">{l.number} · {l.state}</div>
              </div>
              <LicenceStatusBadge status={l.status} className="shrink-0" />
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {l.expiryDate ? <>Expires <span className="num text-foreground">{auDate(l.expiryDate)}</span></> : "No expiry"}
              </span>
              {l.daysLeft !== null && l.daysLeft <= 60 && (
                <span className={l.daysLeft <= 14 ? "text-red-300" : "text-amber-300"}>{daysLabel(l.daysLeft)}</span>
              )}
            </div>
            {l.verification === "REJECTED" && l.verifyNote && (
              <p className="notice-danger mt-2 rounded-md border p-2 text-xs">Rejected: {l.verifyNote}</p>
            )}
            {l.source === "GUARD" && l.verification === "UNVERIFIED" && (
              <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                <span>With the office for checking</span>
                <button className="text-red-300 hover:underline" onClick={() => withdraw(l)}>Remove</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a licence</DialogTitle>
            <DialogDescription>Copy the details exactly as printed on the card.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="g-type">What is it?</Label>
              <Select id="g-type" value={form.type} onChange={set("type")}>
                {LICENCE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="space-y-1">
                <Label htmlFor="g-number">Number</Label>
                <Input id="g-number" className="font-mono" autoCapitalize="characters" value={form.number} onChange={set("number")} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="g-state">State</Label>
                <Select id="g-state" value={form.state} onChange={set("state")}>
                  {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-expiry">Expiry date{def.expires ? "" : " (if any)"}</Label>
              <Input id="g-expiry" type="date" value={form.expiryDate} onChange={set("expiryDate")} required={def.expires} />
            </div>
            <div className="space-y-1">
              <Label>Photo of the licence</Label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground hover:bg-muted/30">
                {doc && doc.dataUrl.startsWith("data:image") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={doc.dataUrl} alt="Licence preview" className="max-h-40 rounded" />
                ) : (
                  <Camera className="h-6 w-6" />
                )}
                <span>{doc ? "Tap to retake" : "Take a photo or choose a file"}</span>
                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={pick} />
              </label>
            </div>
            <DialogFooter className="dialog-footer-sticky">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Uploading…" : "Send for verification"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
