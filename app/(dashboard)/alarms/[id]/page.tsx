"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  X,
  RefreshCcw,
  MapPin,
  Phone,
  StickyNote,
  AlertTriangle,
  UserPlus,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fmtDateTime, utcToLocalInput, localInputToUtc } from "@/lib/date";
import { formatPhoneAU } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ResponderRow {
  id: string;
  responderType: "INTERNAL_GUARD" | "EXTERNAL_CONTRACTOR";
  guardId: string | null;
  externalName: string | null;
  externalPhone: string;
  externalCompany: string | null;
  dispatchedAt: string;
  acknowledgedAt: string | null;
  declinedAt: string | null;
  onsiteAt: string | null;
  offsiteAt: string | null;
  responseResult: string | null;
  responseRawBody: string | null;
  guard: { id: string; firstName: string; lastName: string; phone: string } | null;
}

interface SmsLogRow {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  receivedAt: string;
  status: string | null;
  fromNumber: string;
  toNumber: string;
  alarmResponderId: string | null;
}

interface AlarmDetail {
  id: string;
  docket: string;
  source: string;
  sourceReference: string | null;
  alarmType: string;
  priority: string;
  status: string;
  siteName: string;
  siteAddress: string;
  siteLatitude: number | null;
  siteLongitude: number | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  receivedAt: string;
  description: string | null;
  specialInstructions: string | null;
  notes: string | null;
  resolvedAt: string | null;
  bureau: string | null;
  areaLabel: string | null;
  zoneLabel: string | null;
  rawIntakeText: string | null;
  parserUsed: string | null;
  parseConfidence: string | null;
  responders: ResponderRow[];
  smsLogs: SmsLogRow[];
  site: { id: string; name: string; address: string } | null;
}

function priorityClass(p: string): string {
  switch (p) {
    case "CRITICAL":
      return "bg-red-100 text-red-900 border-red-300";
    case "HIGH":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "MEDIUM":
      return "bg-blue-100 text-blue-900 border-blue-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

function statusClass(s: string): string {
  switch (s) {
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case "ONSITE":
      return "bg-cyan-100 text-cyan-900 border-cyan-300";
    case "ACKNOWLEDGED":
      return "bg-blue-100 text-blue-900 border-blue-300";
    case "DISPATCHED":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "NO_RESPONSE":
      return "bg-red-100 text-red-900 border-red-300";
    case "CANCELLED":
      return "bg-slate-100 text-slate-600 border-slate-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full border", className)}>
      {children}
    </span>
  );
}

function formatMins(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export default function AlarmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [now, setNow] = React.useState(Date.now());
  const [sendToOpen, setSendToOpen] = React.useState(false);
  const [manualResOpen, setManualResOpen] = React.useState(false);

  // Tick every 30s so "X minutes ago" stays fresh on the live-status panel.
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading } = useQuery<AlarmDetail>({
    queryKey: ["alarm", id],
    queryFn: () => api(`/api/alarms/${id}`),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <div className="text-muted-foreground p-4">Loading…</div>;
  if (!data) return <div className="text-muted-foreground p-4">Alarm not found.</div>;

  const latestResponder = data.responders[data.responders.length - 1] ?? null;
  const dispatchedAt = latestResponder ? new Date(latestResponder.dispatchedAt) : null;
  const minsSinceDispatch = dispatchedAt ? now - dispatchedAt.getTime() : 0;
  const isLive =
    data.status === "DISPATCHED" ||
    data.status === "ACKNOWLEDGED" ||
    data.status === "ONSITE";
  const noResponseWarning = isLive && minsSinceDispatch > 15 * 60_000 && !latestResponder?.onsiteAt;

  async function patchAlarm(patch: Record<string, unknown>) {
    try {
      await api(`/api/alarms/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      toast({ title: "Saved", variant: "success" });
      qc.invalidateQueries({ queryKey: ["alarm", id] });
      qc.invalidateQueries({ queryKey: ["alarms"] });
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function onResend() {
    if (!confirm("Resend alarm to the most recent responder?")) return;
    try {
      const r = await api<{ ok: boolean; channel: string; error?: string }>(
        `/api/alarms/${id}/resend`,
        { method: "POST" },
      );
      if (r.ok) {
        toast({ title: `Re-sent via ${r.channel.toUpperCase()}`, variant: "success" });
      } else {
        toast({ title: "Resend failed", description: r.error, variant: "error" });
      }
      qc.invalidateQueries({ queryKey: ["alarm", id] });
    } catch (e: unknown) {
      toast({ title: "Resend failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function onMarkComplete() {
    if (!confirm("Mark this alarm as completed manually?")) return;
    await patchAlarm({ status: "COMPLETED" });
  }

  async function onCancel() {
    if (!confirm("Cancel this alarm? It will be marked CANCELLED and no further dispatches will be sent.")) return;
    await patchAlarm({ status: "CANCELLED" });
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.siteAddress)}`;

  return (
    <>
      <div className="mb-3">
        <Link href="/alarms" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to alarms
        </Link>
      </div>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0">
          <h1 className="font-mono text-2xl font-bold text-brand-navy">#{data.docket}</h1>
          <p className="text-sm text-muted-foreground">
            {data.source}{data.sourceReference && ` · ${data.sourceReference}`}
          </p>
          <p className="text-base font-medium mt-1">{data.siteName}</p>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <MapPin className="h-3 w-3" /> {data.siteAddress}
          </a>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex gap-2">
            <Pill className="bg-slate-100 text-slate-700 border-slate-300">{data.alarmType}</Pill>
            <Pill className={priorityClass(data.priority)}>{data.priority}</Pill>
            <Pill className={statusClass(data.status)}>{data.status.replace("_", " ")}</Pill>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {isLive && (
              <Button variant="outline" size="sm" onClick={onResend}>
                <RefreshCcw className="h-4 w-4" /> Resend
              </Button>
            )}
            {isLive && (
              <Button variant="outline" size="sm" onClick={() => setSendToOpen(true)}>
                <UserPlus className="h-4 w-4" /> Send to different
              </Button>
            )}
            {isLive && (
              <Button variant="outline" size="sm" onClick={() => setManualResOpen(true)}>
                <Edit className="h-4 w-4" /> Enter response
              </Button>
            )}
            {isLive && data.status !== "COMPLETED" && (
              <Button variant="outline" size="sm" onClick={onMarkComplete}>
                <CheckCircle2 className="h-4 w-4" /> Mark complete
              </Button>
            )}
            {isLive && (
              <Button variant="destructive" size="sm" onClick={onCancel}>
                <X className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* No-response warning */}
      {noResponseWarning && (
        <Card className="mb-4 border-amber-400 bg-amber-50">
          <CardContent className="py-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>No response in {formatMins(minsSinceDispatch)}.</strong> Consider sending to a different responder or calling them directly.
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: details + timeline */}
        <div className="lg:col-span-2 space-y-4">
          {/* Live status panel */}
          {isLive && latestResponder && (
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dispatched to</p>
                    <p className="font-medium">
                      {latestResponder.responderType === "INTERNAL_GUARD"
                        ? `${latestResponder.guard?.firstName ?? ""} ${latestResponder.guard?.lastName ?? ""}`.trim()
                        : latestResponder.externalName}
                    </p>
                    <a href={`tel:${latestResponder.externalPhone}`} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <Phone className="h-3 w-3" />
                      {formatPhoneAU(latestResponder.externalPhone)}
                    </a>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {dispatchedAt && <>Dispatched {formatMins(minsSinceDispatch)}</>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Job details */}
          <Card>
            <CardContent className="py-3 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Received</p>
                  <p>{fmtDateTime(data.receivedAt)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Source</p>
                  <p>{data.source}</p>
                </div>
              </div>
              {(data.bureau || data.areaLabel || data.zoneLabel) && (
                <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                  {data.bureau && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bureau</p>
                      <p className="text-xs">{data.bureau}</p>
                    </div>
                  )}
                  {data.areaLabel && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Area</p>
                      <p className="text-xs">{data.areaLabel}</p>
                    </div>
                  )}
                  {data.zoneLabel && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Zone</p>
                      <p className="text-xs">{data.zoneLabel}</p>
                    </div>
                  )}
                </div>
              )}
              {data.description && (
                <div className="pt-2 border-t">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description</p>
                  <p className="whitespace-pre-wrap">{data.description}</p>
                </div>
              )}
              {data.specialInstructions && (
                <div className="pt-2 border-t">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Special instructions</p>
                  <p className="whitespace-pre-wrap">{data.specialInstructions}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardContent className="py-3">
              <h3 className="text-sm font-semibold mb-2">Timeline</h3>
              <ul className="space-y-2 ml-1 text-sm">
                <TimelineEvent
                  when={data.receivedAt}
                  label="Alarm received"
                  dotColour="#94A3B8"
                />
                {data.responders.map((r) => (
                  <React.Fragment key={r.id}>
                    <TimelineEvent
                      when={r.dispatchedAt}
                      label={`Dispatched to ${r.responderType === "INTERNAL_GUARD" ? (r.guard ? `${r.guard.firstName} ${r.guard.lastName}` : "guard") : (r.externalName ?? r.externalPhone)}`}
                      dotColour="#F59E0B"
                    />
                    {r.acknowledgedAt && (
                      <TimelineEvent when={r.acknowledgedAt} label="Acknowledged" dotColour="#3B82F6" />
                    )}
                    {r.declinedAt && (
                      <TimelineEvent when={r.declinedAt} label="Responder declined" dotColour="#EF4444" />
                    )}
                    {r.onsiteAt && (
                      <TimelineEvent when={r.onsiteAt} label="Onsite" dotColour="#0891B2" />
                    )}
                    {r.offsiteAt && (
                      <TimelineEvent
                        when={r.offsiteAt}
                        label={`Offsite${r.responseResult ? ` — "${r.responseResult}"` : ""}`}
                        dotColour="#10B981"
                      />
                    )}
                  </React.Fragment>
                ))}
                {data.resolvedAt && data.status === "COMPLETED" && (
                  <TimelineEvent when={data.resolvedAt} label="Job closed" dotColour="#10B981" />
                )}
                {data.status === "CANCELLED" && data.resolvedAt && (
                  <TimelineEvent when={data.resolvedAt} label="Cancelled by admin" dotColour="#64748B" />
                )}
              </ul>
            </CardContent>
          </Card>

          {/* Raw intake text (audit) */}
          {data.rawIntakeText && (
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Original message</h3>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Parser: {data.parserUsed} · {data.parseConfidence}
                  </p>
                </div>
                <pre className="text-[11px] whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded border">{data.rawIntakeText}</pre>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: client + notes */}
        <div className="space-y-4">
          {/* Client */}
          <Card>
            <CardContent className="py-3 space-y-2">
              <h3 className="text-sm font-semibold mb-1">Client</h3>
              <ClientField
                label="Name"
                value={data.clientName ?? ""}
                onSave={(v) => patchAlarm({ clientName: v })}
              />
              <ClientField
                label="Email"
                value={data.clientEmail ?? ""}
                type="email"
                onSave={(v) => patchAlarm({ clientEmail: v })}
              />
              <ClientField
                label="Phone"
                value={data.clientPhone ?? ""}
                onSave={(v) => patchAlarm({ clientPhone: v })}
              />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="py-3">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
                <StickyNote className="h-4 w-4" /> Admin notes
              </h3>
              <NotesEditor
                initial={data.notes ?? ""}
                onSave={(v) => patchAlarm({ notes: v })}
              />
            </CardContent>
          </Card>

          {/* Manual status override */}
          <Card>
            <CardContent className="py-3">
              <Label className="text-sm font-semibold">Status (manual override)</Label>
              <Select
                value={data.status}
                onChange={(e) => patchAlarm({ status: e.target.value })}
                className="mt-1"
              >
                {["DISPATCHED", "ACKNOWLEDGED", "ONSITE", "COMPLETED", "NO_RESPONSE", "CANCELLED"].map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Use if you closed the job over the phone instead of via SMS reply.
              </p>
            </CardContent>
          </Card>

          {/* SMS log */}
          {data.smsLogs.length > 0 && (
            <Card>
              <CardContent className="py-3">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <Send className="h-4 w-4" /> SMS log
                </h3>
                <ul className="space-y-2 text-xs">
                  {data.smsLogs.map((l) => (
                    <li key={l.id} className={cn(
                      "p-2 rounded border",
                      l.direction === "OUTBOUND" ? "bg-blue-50 border-blue-200" : "bg-emerald-50 border-emerald-200",
                    )}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium uppercase tracking-wide text-[10px]">
                          {l.direction === "OUTBOUND" ? "→ Sent" : "← Received"}
                        </span>
                        <span className="text-muted-foreground">{fmtDateTime(l.receivedAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">{l.body}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <SendToDifferentDialog
        open={sendToOpen}
        onOpenChange={setSendToOpen}
        alarmId={data.id}
        docket={data.docket}
        onSent={() => qc.invalidateQueries({ queryKey: ["alarm", id] })}
      />
      <ManualResponseDialog
        open={manualResOpen}
        onOpenChange={setManualResOpen}
        alarmId={data.id}
        docket={data.docket}
        onSaved={() => qc.invalidateQueries({ queryKey: ["alarm", id] })}
      />
    </>
  );
}

// -----------------------------------------------------------------------------
// Send to a different responder dialog
// -----------------------------------------------------------------------------

interface GuardOption {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  active: boolean;
}

function SendToDifferentDialog({
  open,
  onOpenChange,
  alarmId,
  docket,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  alarmId: string;
  docket: string;
  onSent?: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = React.useState<"INTERNAL_GUARD" | "EXTERNAL_CONTRACTOR">("INTERNAL_GUARD");
  const [guardId, setGuardId] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [guards, setGuards] = React.useState<GuardOption[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setType("INTERNAL_GUARD");
    setGuardId("");
    setName("");
    setPhone("");
    setCompany("");
    setSubmitting(false);
    (async () => {
      try {
        const list = await api<GuardOption[]>("/api/guards?active=true");
        setGuards(list);
      } catch {
        /* no guards is fine — admin can use external */
      }
    })();
  }, [open]);

  async function onSubmit() {
    if (type === "INTERNAL_GUARD" && !guardId) {
      toast({ title: "Pick a guard", variant: "error" });
      return;
    }
    if (type === "EXTERNAL_CONTRACTOR" && (!name.trim() || !phone.trim())) {
      toast({ title: "Name and phone are required", variant: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const body =
        type === "INTERNAL_GUARD"
          ? { type, guardId }
          : { type, name: name.trim(), phone: phone.trim(), company: company.trim() || undefined };
      const r = await api<{ ok: boolean; channel: string; error?: string }>(
        `/api/alarms/${alarmId}/dispatch`,
        { method: "POST", body: JSON.stringify(body) },
      );
      if (r.ok) {
        toast({
          title: `Sent to new responder via ${r.channel.toUpperCase()}`,
          description: `Docket #${docket} is back in DISPATCHED state.`,
          variant: "success",
        });
        onOpenChange(false);
        onSent?.();
      } else {
        toast({ title: "Dispatch failed", description: r.error, variant: "error" });
      }
    } catch (e: unknown) {
      toast({ title: "Dispatch failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Docket #{docket} to a different responder</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Creates a new dispatch alongside the original. The original responder remains in the timeline for the audit trail.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("INTERNAL_GUARD")}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-sm",
                type === "INTERNAL_GUARD" ? "bg-brand-navy text-white border-brand-navy" : "bg-background hover:bg-muted",
              )}
            >
              Internal guard
            </button>
            <button
              type="button"
              onClick={() => setType("EXTERNAL_CONTRACTOR")}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-sm",
                type === "EXTERNAL_CONTRACTOR" ? "bg-brand-navy text-white border-brand-navy" : "bg-background hover:bg-muted",
              )}
            >
              External contractor
            </button>
          </div>
          {type === "INTERNAL_GUARD" ? (
            <Select value={guardId} onChange={(e) => setGuardId(e.target.value)}>
              <option value="">Select guard…</option>
              {guards.map((g) => (
                <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>
              ))}
            </Select>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="+61412345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input className="col-span-2" placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Sending…" : "Send dispatch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Manual response entry dialog
// -----------------------------------------------------------------------------

function ManualResponseDialog({
  open,
  onOpenChange,
  alarmId,
  docket,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  alarmId: string;
  docket: string;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [onsite, setOnsite] = React.useState("");
  const [offsite, setOffsite] = React.useState("");
  const [result, setResult] = React.useState("All good and secure.");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const now = new Date();
    const halfHourAgo = new Date(now.getTime() - 30 * 60_000);
    setOnsite(utcToLocalInput(halfHourAgo));
    setOffsite(utcToLocalInput(now));
    setResult("All good and secure.");
    setSubmitting(false);
  }, [open]);

  async function onSubmit() {
    if (!onsite || !offsite || !result.trim()) {
      toast({ title: "All fields required", variant: "error" });
      return;
    }
    setSubmitting(true);
    try {
      await api(`/api/alarms/${alarmId}/manual-complete`, {
        method: "POST",
        body: JSON.stringify({
          onsiteAt: localInputToUtc(onsite).toISOString(),
          offsiteAt: localInputToUtc(offsite).toISOString(),
          result: result.trim(),
        }),
      });
      toast({ title: `Docket #${docket} closed manually`, variant: "success" });
      onOpenChange(false);
      onSaved?.();
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter response manually — Docket #{docket}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Use this when the responder phoned in instead of texting back, or to correct what the parser captured. This closes the docket and updates the timeline.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Onsite</Label>
              <Input type="datetime-local" value={onsite} onChange={(e) => setOnsite(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Offsite</Label>
              <Input type="datetime-local" value={offsite} onChange={(e) => setOffsite(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Result</Label>
            <Textarea
              rows={3}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="All good and secure, false alarm, broken window etc."
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Mark complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimelineEvent({
  when,
  label,
  dotColour,
}: {
  when: string;
  label: string;
  dotColour: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="h-2 w-2 rounded-full shrink-0 mt-1.5"
        style={{ backgroundColor: dotColour }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p>{label}</p>
        <p className="text-[10px] text-muted-foreground">{fmtDateTime(when)}</p>
      </div>
    </li>
  );
}

function ClientField({
  label,
  value,
  type = "text",
  onSave,
}: {
  label: string;
  value: string;
  type?: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  const dirty = v !== value;
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="flex gap-1">
        <Input
          type={type}
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="text-sm"
        />
        {dirty && (
          <Button size="sm" onClick={() => onSave(v)} className="shrink-0">
            Save
          </Button>
        )}
      </div>
    </div>
  );
}

function NotesEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = React.useState(initial);
  React.useEffect(() => setV(initial), [initial]);
  const dirty = v !== initial;
  return (
    <div className="space-y-2">
      <Textarea rows={4} value={v} onChange={(e) => setV(e.target.value)} placeholder="Internal notes (only admin can see this)…" />
      {dirty && (
        <Button size="sm" onClick={() => onSave(v)}>
          Save notes
        </Button>
      )}
    </div>
  );
}
