"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

const ALARM_TYPES = ["BURGLARY", "FIRE", "MEDICAL", "PANIC", "TAMPER", "DURESS", "OTHER"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

interface ParseResponse {
  parser: string;
  confidence: "high" | "low" | "manual";
  fields: {
    source?: string;
    sourceReference?: string;
    receivedAt?: string;
    bureau?: string;
    areaLabel?: string;
    zoneLabel?: string;
    siteName?: string;
    siteAddress?: string;
    alarmType?: string;
  };
  geocode: { latitude: number; longitude: number } | null;
  siteMatch: {
    id: string;
    name: string;
    address: string;
    contactName: string | null;
    contactPhone: string | null;
  } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

interface GuardOption {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  active: boolean;
}

interface FormState {
  source: string;
  sourceReference: string;
  alarmType: string;
  priority: string;
  siteName: string;
  siteAddress: string;
  siteLatitude: number | null;
  siteLongitude: number | null;
  siteId: string | null;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  description: string;
  specialInstructions: string;
  bureau: string;
  areaLabel: string;
  zoneLabel: string;
  rawIntakeText: string;
  parserUsed: string;
  parseConfidence: string;
  // Responder
  responderType: "INTERNAL_GUARD" | "EXTERNAL_CONTRACTOR";
  responderGuardId: string;
  responderExternalName: string;
  responderExternalPhone: string;
  responderExternalCompany: string;
}

const EMPTY_FORM: FormState = {
  source: "Guardian Security Group",
  sourceReference: "",
  alarmType: "BURGLARY",
  priority: "HIGH",
  siteName: "",
  siteAddress: "",
  siteLatitude: null,
  siteLongitude: null,
  siteId: null,
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  description: "",
  specialInstructions: "",
  bureau: "",
  areaLabel: "",
  zoneLabel: "",
  rawIntakeText: "",
  parserUsed: "manual",
  parseConfidence: "manual",
  responderType: "INTERNAL_GUARD",
  responderGuardId: "",
  responderExternalName: "",
  responderExternalPhone: "",
  responderExternalCompany: "",
};

export function NewAlarmDialog({ open, onOpenChange, onCreated }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"paste" | "manual">("paste");
  const [pasteText, setPasteText] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [parseResult, setParseResult] = React.useState<ParseResponse | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);

  const { data: guards = [] } = useQuery<GuardOption[]>({
    queryKey: ["guards", "active"],
    queryFn: () => api(`/api/guards?active=true`),
    enabled: open,
  });

  // Reset on open
  React.useEffect(() => {
    if (!open) return;
    setTab("paste");
    setPasteText("");
    setParseResult(null);
    setForm(EMPTY_FORM);
  }, [open]);

  function applyParseResult(result: ParseResponse) {
    setParseResult(result);
    const f = result.fields;
    setForm((prev) => ({
      ...prev,
      source: f.source ?? prev.source,
      sourceReference: f.sourceReference ?? "",
      alarmType: f.alarmType ?? prev.alarmType,
      siteName: f.siteName ?? "",
      siteAddress: f.siteAddress ?? "",
      siteLatitude: result.geocode?.latitude ?? null,
      siteLongitude: result.geocode?.longitude ?? null,
      siteId: result.siteMatch?.id ?? null,
      // Auto-fill client name from matched Site contactName.
      clientName: result.siteMatch?.contactName ?? prev.clientName,
      clientPhone: result.siteMatch?.contactPhone ?? prev.clientPhone,
      bureau: f.bureau ?? "",
      areaLabel: f.areaLabel ?? "",
      zoneLabel: f.zoneLabel ?? "",
      rawIntakeText: pasteText,
      parserUsed: result.parser,
      parseConfidence: result.confidence,
    }));
  }

  async function onParse() {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const res = await api<ParseResponse>(`/api/alarms/parse`, {
        method: "POST",
        body: JSON.stringify({ text: pasteText }),
      });
      applyParseResult(res);
      if (res.confidence === "manual") {
        toast({
          title: "Format not recognised",
          description: "Please fill the fields manually below.",
          variant: "error",
        });
      } else {
        toast({
          title: `Parsed (${res.confidence} confidence)`,
          description: `Detected: ${res.parser}`,
          variant: "success",
        });
      }
    } catch (e: unknown) {
      toast({ title: "Parse failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setParsing(false);
    }
  }

  async function onDispatch() {
    if (!form.siteName.trim() || !form.siteAddress.trim()) {
      toast({ title: "Site name and address are required", variant: "error" });
      return;
    }
    if (form.responderType === "INTERNAL_GUARD" && !form.responderGuardId) {
      toast({ title: "Pick a guard", variant: "error" });
      return;
    }
    if (form.responderType === "EXTERNAL_CONTRACTOR" && (!form.responderExternalName.trim() || !form.responderExternalPhone.trim())) {
      toast({ title: "Contractor name and phone are required", variant: "error" });
      return;
    }

    setSubmitting(true);
    try {
      const responder =
        form.responderType === "INTERNAL_GUARD"
          ? { type: "INTERNAL_GUARD" as const, guardId: form.responderGuardId }
          : {
              type: "EXTERNAL_CONTRACTOR" as const,
              name: form.responderExternalName.trim(),
              phone: form.responderExternalPhone.trim(),
              company: form.responderExternalCompany.trim() || undefined,
            };

      const payload = {
        source: form.source,
        sourceReference: form.sourceReference || undefined,
        alarmType: form.alarmType,
        priority: form.priority,
        siteName: form.siteName,
        siteAddress: form.siteAddress,
        siteLatitude: form.siteLatitude,
        siteLongitude: form.siteLongitude,
        siteId: form.siteId,
        clientName: form.clientName || undefined,
        clientEmail: form.clientEmail || undefined,
        clientPhone: form.clientPhone || undefined,
        description: form.description || undefined,
        specialInstructions: form.specialInstructions || undefined,
        receivedAt: parseResult?.fields.receivedAt,
        bureau: form.bureau || undefined,
        areaLabel: form.areaLabel || undefined,
        zoneLabel: form.zoneLabel || undefined,
        rawIntakeText: form.rawIntakeText || undefined,
        parserUsed: tab === "manual" ? "manual" : form.parserUsed,
        parseConfidence: tab === "manual" ? "manual" : form.parseConfidence,
        responder,
      };

      const r = await api<{ id: string; docket: string; dispatch: string; dispatchError?: string }>(
        `/api/alarms`,
        { method: "POST", body: JSON.stringify(payload) },
      );

      if (r.dispatch === "failed") {
        toast({
          title: `Docket #${r.docket} created, but SMS failed`,
          description: r.dispatchError ?? "Use Resend on the detail page.",
          variant: "error",
        });
      } else {
        toast({ title: `Docket #${r.docket} dispatched`, variant: "success" });
      }
      onOpenChange(false);
      onCreated?.();
      router.push(`/alarms/${r.id}`);
    } catch (e: unknown) {
      toast({ title: "Create failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  // Shared form fields (rendered in both tabs after parse / from blank).
  const formFields = (
    <div className="space-y-3">
      {parseResult && parseResult.siteMatch && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          <div className="font-medium">Matched existing Site: {parseResult.siteMatch.name}</div>
          <div className="text-emerald-700">Client name + phone auto-filled from this site.</div>
        </div>
      )}
      {parseResult && !parseResult.siteMatch && parseResult.fields.siteName && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-medium">No existing Site matched this address.</div>
          <div>You can dispatch as ad-hoc, or use Sites → Add Site after to save it for next time.</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Source</Label>
          <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Source reference</Label>
          <Input value={form.sourceReference} onChange={(e) => setForm({ ...form, sourceReference: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Alarm type</Label>
          <Select value={form.alarmType} onChange={(e) => setForm({ ...form, alarmType: e.target.value })}>
            {ALARM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Priority</Label>
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Site name</Label>
        <Input value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value, siteId: null })} />
      </div>
      <div className="space-y-1">
        <Label>Site address</Label>
        <Input value={form.siteAddress} onChange={(e) => setForm({ ...form, siteAddress: e.target.value, siteId: null })} />
        {form.siteLatitude !== null && (
          <p className="text-[10px] text-muted-foreground">📍 {form.siteLatitude.toFixed(4)}, {form.siteLongitude?.toFixed(4)}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Client name</Label>
          <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Client email</Label>
          <Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Special instructions (gate codes, lockbox, etc.)</Label>
        <Textarea rows={2} value={form.specialInstructions} onChange={(e) => setForm({ ...form, specialInstructions: e.target.value })} />
      </div>

      {/* Responder picker */}
      <div className="border-t pt-3 space-y-2">
        <Label>Responder</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm({ ...form, responderType: "INTERNAL_GUARD" })}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm",
              form.responderType === "INTERNAL_GUARD"
                ? "bg-brand-navy text-white border-brand-navy"
                : "bg-background hover:bg-muted",
            )}
          >
            Internal guard
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, responderType: "EXTERNAL_CONTRACTOR" })}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm",
              form.responderType === "EXTERNAL_CONTRACTOR"
                ? "bg-brand-navy text-white border-brand-navy"
                : "bg-background hover:bg-muted",
            )}
          >
            External contractor
          </button>
        </div>

        {form.responderType === "INTERNAL_GUARD" ? (
          <Select value={form.responderGuardId} onChange={(e) => setForm({ ...form, responderGuardId: e.target.value })}>
            <option value="">Select guard…</option>
            {guards.map((g) => (
              <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>
            ))}
          </Select>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Name" value={form.responderExternalName} onChange={(e) => setForm({ ...form, responderExternalName: e.target.value })} />
            <Input placeholder="+61412345678" value={form.responderExternalPhone} onChange={(e) => setForm({ ...form, responderExternalPhone: e.target.value })} />
            <Input className="col-span-2" placeholder="Company (optional)" value={form.responderExternalCompany} onChange={(e) => setForm({ ...form, responderExternalCompany: e.target.value })} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New alarm</DialogTitle>
        </DialogHeader>

        {/* Tab strip */}
        <div className="flex gap-1 border-b -mx-6 px-6 mb-3">
          <button
            type="button"
            onClick={() => setTab("paste")}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px",
              tab === "paste" ? "text-brand-navy border-brand-navy" : "text-muted-foreground border-transparent",
            )}
          >
            Paste alarm
          </button>
          <button
            type="button"
            onClick={() => setTab("manual")}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px",
              tab === "manual" ? "text-brand-navy border-brand-navy" : "text-muted-foreground border-transparent",
            )}
          >
            Manual entry
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto -mx-6 px-6">
          {tab === "paste" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Paste the alarm message</Label>
                <Textarea
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`From: Guardian Security Group\n2026-05-17 17:00:54\nBureau: ...\nArea: ...\nZone: ...\nAddress:\n...\nJob number ...`}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={onParse} disabled={parsing || !pasteText.trim()}>
                  {parsing ? "Parsing…" : "Parse"}
                </Button>
                {parseResult && (
                  <p className="text-xs text-muted-foreground">
                    Detected: <strong>{parseResult.parser}</strong> ({parseResult.confidence} confidence)
                  </p>
                )}
              </div>

              {parseResult && (
                <>
                  <div className="h-px bg-border my-3" />
                  {formFields}
                </>
              )}
            </div>
          )}

          {tab === "manual" && formFields}
        </div>

        <DialogFooter className="dialog-footer-sticky">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onDispatch}
            disabled={
              submitting ||
              (tab === "paste" && !parseResult)
            }
          >
            {submitting ? "Dispatching…" : "Send alarm SMS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
