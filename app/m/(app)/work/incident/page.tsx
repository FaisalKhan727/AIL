"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fileToDataUrl } from "@/lib/file-to-dataurl";
import { INCIDENT_TYPES, PRIORITIES, refLabel } from "@/lib/ops";
import type { WorkResp } from "../page";

export default function GuardIncident() {
  const router = useRouter();
  const { toast } = useToast();
  const { data } = useQuery<WorkResp>({ queryKey: ["m-work"], queryFn: () => api(`/api/m/work`) });
  const [form, setForm] = React.useState({ siteId: "", type: "Suspicious Activity", severity: "MEDIUM", zone: "", narrative: "", persons: "" });
  const [photo, setPhoto] = React.useState<{ name: string; dataUrl: string } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api<{ ref: number }>(`/api/m/incidents`, { method: "POST", body: JSON.stringify({ ...form, zone: form.zone || undefined, persons: form.persons || undefined, ...(photo ? { photo } : {}) }) });
      toast({ title: "Incident reported", description: `${refLabel("INC", r.ref)} is with the control room.`, variant: "success" });
      router.replace("/m/work");
    } catch (err) {
      toast({ title: "Couldn't send report", description: err instanceof Error ? err.message : "", variant: "error" });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Link href="/m/work" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Tasks</Link>
      <h1 className="font-display text-2xl font-extrabold">Report an incident</h1>
      <p className="text-sm text-muted-foreground">In an emergency call 000 first, then the control room.</p>
      <div className="space-y-1"><Label htmlFor="i-site">Site</Label>
        <Select id="i-site" value={form.siteId} onChange={set("siteId")} required>
          <option value="">Select site…</option>
          {data?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      <div className="space-y-1"><Label htmlFor="i-zone">Where exactly</Label><Input id="i-zone" value={form.zone} onChange={set("zone")} placeholder="Loading dock, level 2 car park…" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label htmlFor="i-type">Type</Label><Select id="i-type" value={form.type} onChange={set("type")}>{INCIDENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></div>
        <div className="space-y-1"><Label htmlFor="i-sev">Severity</Label><Select id="i-sev" value={form.severity} onChange={set("severity")}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</Select></div>
      </div>
      <div className="space-y-1"><Label htmlFor="i-what">What happened</Label><Textarea id="i-what" rows={5} value={form.narrative} onChange={set("narrative")} required minLength={10} placeholder="What you saw, what you did, who you told. Times help." /></div>
      <div className="space-y-1"><Label htmlFor="i-who">People involved (optional)</Label><Textarea id="i-who" rows={2} value={form.persons} onChange={set("persons")} placeholder="Descriptions, names, witnesses" /></div>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.dataUrl} alt="Incident photo preview" className="max-h-40 rounded" />
        ) : <Camera className="h-6 w-6" />}
        <span>{photo ? "Tap to replace photo" : "Add a photo (optional)"}</span>
        <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return;
          try { setPhoto(await fileToDataUrl(f)); } catch (err) { toast({ title: "Couldn't use that photo", description: err instanceof Error ? err.message : "", variant: "error" }); }
        }} />
      </label>
      <Button type="submit" className="h-12 w-full text-base" disabled={saving}>{saving ? "Sending…" : "Send report"}</Button>
    </form>
  );
}
