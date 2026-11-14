"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Download, MessageSquare, Plus, Send, Users2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/fetcher";
import { fmtDateTime, fmtTime } from "@/lib/date";
import { cn, formatPhoneAU } from "@/lib/utils";
import { ALARM_TYPES, PRIORITIES, elapsedLabel, refLabel, responseSla, sopFor } from "@/lib/ops";
import { downloadCsv } from "@/lib/csv-client";
import { DataTable, Panel, Pill, ResourceDialog, Stat, StatusPill, Tabs, useAct, type Col } from "@/components/ops/kit";
import { PromptDialog, type PromptSpec } from "@/components/ops/prompt-dialog";

interface AlarmEvent { id: string; at: string; actor: string; text: string }
interface Alarm {
  id: string; ref: number; siteId: string; siteName: string; zone: string | null; type: string; priority: string;
  verification: string; status: string; guardId: string | null; guardName: string | null; guardPhone: string | null; etaMins: number | null;
  triggeredAt: string; dispatchedAt: string | null; onSceneAt: string | null; resolvedAt: string | null; resolvedBy: string | null;
  outcome: string | null; sopDone: number[]; events: AlarmEvent[];
}
interface GuardOpt { id: string; name: string; phone: string; onShiftSiteId: string | null; onShiftSite: string | null; clockedIn: boolean; busy: boolean }
interface Contact { name: string; phone: string }
interface Resp { alarms: Alarm[]; sites: { id: string; name: string }[]; guards: GuardOpt[]; contacts: Contact[] }

const RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function useNow(ms = 1000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const slaTone = { ok: "text-success", warning: "text-warning", breached: "text-critical" } as const;

export default function AlarmsPage() {
  const qc = useQueryClient();
  const act = useAct();
  const now = useNow();
  const [tab, setTab] = React.useState<"active" | "history">("active");
  const active = useQuery<Resp>({ queryKey: ["alarms", "active"], queryFn: () => api(`/api/alarms`), refetchInterval: 5000 });
  const history = useQuery<Resp>({ queryKey: ["alarms", "history"], queryFn: () => api(`/api/alarms?scope=history`), enabled: tab === "history" });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [dispatching, setDispatching] = React.useState<Alarm | null>(null);
  const [texting, setTexting] = React.useState<Alarm | null>(null);
  const [contactsOpen, setContactsOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState<PromptSpec | null>(null);
  const [open, setOpen] = React.useState<Record<string, "timeline" | "sop" | undefined>>({});

  const refresh = React.useCallback(() => qc.invalidateQueries({ queryKey: ["alarms"] }), [qc]);
  const send = (a: Alarm, body: Record<string, unknown>, ok?: string) =>
    act(async () => { await api(`/api/alarms/${a.id}`, { method: "POST", body: JSON.stringify(body) }); await refresh(); }, ok);

  // Tick the procedure step immediately; the server call follows and the
  // next poll confirms it.
  const tickSop = (a: Alarm, index: number, done: boolean, label: string) => {
    qc.setQueryData<Resp>(["alarms", "active"], (d) =>
      d && { ...d, alarms: d.alarms.map((x) => (x.id === a.id ? { ...x, sopDone: done ? [...x.sopDone, index] : x.sopDone.filter((n) => n !== index) } : x)) },
    );
    return send(a, { action: "sop", index, done, label });
  };

  const data = active.data;
  const queue = [...(data?.alarms ?? [])].sort((a, b) => RANK[a.priority] - RANK[b.priority] || +new Date(a.triggeredAt) - +new Date(b.triggeredAt));
  const board = queue.filter((a) => a.guardId);

  return (
    <>
      <PageHeader
        title="Alarm Response & Dispatch"
        description="Log an alarm, send the nearest guard, tell the people who need to know, and keep the record."
        actions={
          <>
            <Button variant="outline" onClick={() => setContactsOpen(true)}><Users2 className="h-4 w-4" /> SMS contacts</Button>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Log alarm</Button>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[{ key: "active", label: "Active queue", count: queue.length }, { key: "history", label: "History" }]}
      />

      {tab === "active" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            {active.isLoading && <p className="text-muted-foreground">Loading…</p>}
            {data && queue.length === 0 && (
              <div className="rounded-[10px] border border-dashed p-10 text-center text-sm text-muted-foreground">
                No active alarms. Use “Log alarm” when a monitoring centre or site calls one in.
              </div>
            )}
            {queue.map((a) => {
              const sla = responseSla(a, now);
              const sop = sopFor(a.type);
              const view = open[a.id];
              const toggle = (v: "timeline" | "sop") => setOpen((o) => ({ ...o, [a.id]: o[a.id] === v ? undefined : v }));
              return (
                <article key={a.id} className={cn("rounded-[10px] border bg-card", a.priority === "CRITICAL" && a.status === "UNASSIGNED" && "alarm-critical")}>
                  <div className="p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={a.priority} />
                      <span className="font-mono text-xs text-muted-foreground">{refLabel("ALM", a.ref)}</span>
                      <span className="text-sm font-semibold">{a.type}</span>
                      <span className={cn("num ml-auto text-sm", slaTone[sla.state])} title={`Response target ${Math.round(sla.targetMs / 60000)} min`}>
                        {a.onSceneAt ? "on scene in " : ""}{elapsedLabel(sla.elapsedMs)}
                      </span>
                    </div>
                    <div className="mt-2 text-[15px] font-semibold">{a.siteName}{a.zone ? <span className="font-normal text-muted-foreground"> · {a.zone}</span> : null}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Triggered {fmtTime(a.triggeredAt)}</span>
                      <StatusPill status={a.verification} />
                      <StatusPill status={a.status} />
                      {a.guardName && <span className="text-foreground">→ {a.guardName}{a.etaMins && a.status !== "ON_SCENE" ? ` · ETA ${a.etaMins} min` : ""}</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button size="sm" onClick={() => setDispatching(a)}>{a.guardId ? "Re-dispatch" : "Dispatch guard"}</Button>
                      <Button size="sm" variant="outline" onClick={() => setTexting(a)}><Send className="h-3.5 w-3.5" /> SMS alert</Button>
                      <Select
                        className="h-9 w-auto md:h-8 text-[13px]"
                        aria-label="Verification"
                        value={a.verification}
                        onChange={(e) => send(a, { action: "verify", verification: e.target.value })}
                      >
                        <option value="UNVERIFIED">Unverified</option>
                        <option value="CCTV_CONFIRMED">CCTV confirmed</option>
                        <option value="GUARD_CONFIRMED">Guard confirmed</option>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => setPrompt({ title: "Add note", confirm: "Add note", required: true, placeholder: "What happened or what was done", onSubmit: (text) => send(a, { action: "note", text }) })}>
                        <MessageSquare className="h-3.5 w-3.5" /> Note
                      </Button>
                      {a.priority !== "CRITICAL" && <Button size="sm" variant="outline" onClick={() => send(a, { action: "escalate" }, "Escalated")}>Escalate</Button>}
                      <Button size="sm" variant="outline" onClick={() => setPrompt({ title: "Mark as false alarm", description: "Closes the alarm and counts it in the false-alarm rate.", confirm: "Mark false alarm", placeholder: "Cause, if known (optional)", onSubmit: (outcome) => send(a, { action: "false-alarm", outcome }, "Closed as false alarm") })}>
                        False alarm
                      </Button>
                      <Button size="sm" variant="outline" className="border-success/50 text-emerald-300" onClick={() => setPrompt({ title: `Resolve ${refLabel("ALM", a.ref)}`, confirm: "Resolve", required: true, placeholder: "Outcome: what was found and what was done", onSubmit: (outcome) => send(a, { action: "resolve", outcome }, "Alarm resolved") })}>
                        Resolve
                      </Button>
                    </div>
                  </div>
                  <div className="flex border-t text-xs">
                    {(["sop", "timeline"] as const).map((k) => (
                      <button key={k} onClick={() => toggle(k)} className={cn("flex flex-1 items-center justify-center gap-1.5 py-2 text-muted-foreground hover:text-foreground", view === k && "bg-muted/40 text-foreground")}>
                        {k === "sop" ? `Procedure (${a.sopDone.length}/${sop.length})` : `Timeline (${a.events.length})`}
                        {view === k ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                  {view === "sop" && (
                    <ul className="space-y-1.5 border-t p-3.5 text-sm">
                      {sop.map((step, i) => (
                        <li key={step}>
                          <label className="flex cursor-pointer items-start gap-2.5">
                            <input type="checkbox" className="mt-1" checked={a.sopDone.includes(i)} onChange={(e) => tickSop(a, i, e.target.checked, step)} />
                            <span className={a.sopDone.includes(i) ? "text-muted-foreground line-through" : ""}>{step}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  {view === "timeline" && (
                    <ol className="space-y-1.5 border-t p-3.5">
                      {a.events.map((e) => (
                        <li key={e.id} className="grid grid-cols-[3.2rem_1fr] gap-2 text-xs">
                          <span className="font-mono text-muted-foreground">{fmtTime(e.at)}</span>
                          <span><span className="font-medium">{e.actor}</span> <span className="text-muted-foreground">· {e.text}</span></span>
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              );
            })}
          </div>

          <Panel title="Dispatch board" className="self-start">
            {board.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No guards dispatched.</p>}
            <ul className="divide-y">
              {board.map((a) => {
                const sla = responseSla(a, now);
                return (
                  <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{a.guardName}</div>
                        <div className="truncate text-xs text-muted-foreground">{a.type} · {a.siteName}</div>
                        {a.guardPhone && <a href={`tel:${a.guardPhone}`} className="font-mono text-xs text-cyan hover:underline">{formatPhoneAU(a.guardPhone)}</a>}
                      </div>
                      <div className="text-right">
                        <StatusPill status={a.status} />
                        <div className={cn("num mt-1 text-xs", slaTone[sla.state])}>
                          {sla.state === "breached" ? "SLA breached" : `${elapsedLabel(Math.max(0, sla.targetMs - sla.elapsedMs))} left`}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      {a.status !== "ON_SCENE" && <Button size="sm" variant="outline" onClick={() => send(a, { action: "on-scene" }, "Marked on scene")}>Mark on scene</Button>}
                      <Button size="sm" variant="ghost" className="text-red-300" onClick={() => { if (confirm(`Recall ${a.guardName}?`)) send(a, { action: "recall" }, "Guard recalled"); }}>Recall</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      )}

      {tab === "history" && <History alarms={history.data?.alarms ?? []} loading={history.isLoading} />}

      <ResourceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Log alarm"
        endpoint="/api/alarms"
        onSaved={() => { refresh(); }}
        fields={[
          { name: "siteId", label: "Site", type: "select", required: true, options: (data?.sites ?? []).map((s) => ({ value: s.id, label: s.name })) },
          { name: "type", label: "Alarm type", type: "select", required: true, half: true, options: ALARM_TYPES.map((t) => ({ value: t, label: t })) },
          { name: "priority", label: "Priority", type: "select", required: true, half: true, options: PRIORITIES.map((p) => ({ value: p, label: p })) },
          { name: "zone", label: "Zone", placeholder: "Loading dock, Lobby, Car park L2…" },
          { name: "note", label: "Source / note", placeholder: "Who reported it" },
        ]}
      />
      <DispatchDialog alarm={dispatching} guards={data?.guards ?? []} onClose={() => setDispatching(null)} onDone={refresh} />
      <SmsDialog alarm={texting} contacts={data?.contacts ?? []} onClose={() => setTexting(null)} onDone={refresh} onManage={() => { setTexting(null); setContactsOpen(true); }} />
      <ContactsDialog open={contactsOpen} onOpenChange={setContactsOpen} contacts={data?.contacts ?? []} onDone={refresh} />
      <PromptDialog spec={prompt} onClose={() => setPrompt(null)} />
    </>
  );
}

function DispatchDialog({ alarm, guards, onClose, onDone }: { alarm: Alarm | null; guards: GuardOpt[]; onClose: () => void; onDone: () => void }) {
  const act = useAct();
  const [guardId, setGuardId] = React.useState("");
  const [eta, setEta] = React.useState("10");
  const [note, setNote] = React.useState("");
  const [sms, setSms] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setGuardId(""); setEta("10"); setNote(""); setSms(true); setBusy(false); }, [alarm?.id]);
  if (!alarm) return null;

  // Nearest first: on shift at this site, then on shift elsewhere, then off shift.
  const rank = (g: GuardOpt) => (g.busy ? 4 : g.onShiftSiteId === alarm.siteId ? 0 : g.clockedIn ? 1 : g.onShiftSiteId ? 2 : 3);
  const sorted = [...guards].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const where = (g: GuardOpt) =>
    g.busy ? "On another alarm" : g.onShiftSiteId === alarm.siteId ? "On shift at this site" : g.onShiftSite ? `On shift · ${g.onShiftSite}` : "Not on shift";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!guardId) return;
    setBusy(true);
    const ok = await act(async () => {
      const r = await api<{ smsSent?: boolean }>(`/api/alarms/${alarm!.id}`, { method: "POST", body: JSON.stringify({ action: "dispatch", guardId, etaMins: eta, note: note || undefined, sms }) });
      if (sms && r.smsSent === false) throw new Error("Guard dispatched, but the SMS could not be sent. Call them.");
      await onDone();
    }, "Guard dispatched");
    await onDone();
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:!max-w-xl">
        <DialogHeader>
          <DialogTitle>Dispatch guard</DialogTitle>
          <DialogDescription>{refLabel("ALM", alarm.ref)} · {alarm.priority} {alarm.type} · {alarm.siteName}{alarm.zone ? `, ${alarm.zone}` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="max-h-64 overflow-y-auto rounded-md border">
            {sorted.map((g) => (
              <label key={g.id} className={cn("flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40", guardId === g.id && "bg-primary/15")}>
                <input type="radio" name="guard" checked={guardId === g.id} onChange={() => setGuardId(g.id)} />
                <span className="flex-1">
                  <span className="font-medium">{g.name}</span>
                  <span className="block text-xs text-muted-foreground">{where(g)}{g.clockedIn ? " · clocked in" : ""}</span>
                </span>
                {rank(g) === 0 && <Pill tone="green">Nearest</Pill>}
                {g.busy && <Pill tone="amber">Busy</Pill>}
              </label>
            ))}
            {sorted.length === 0 && <p className="p-4 text-sm text-muted-foreground">No active guards.</p>}
          </div>
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <div className="space-y-1"><Label htmlFor="eta">ETA (mins)</Label><Input id="eta" type="number" min={1} max={240} value={eta} onChange={(e) => setEta(e.target.value)} required /></div>
            <div className="space-y-1"><Label htmlFor="dnote">Instructions</Label><Input id="dnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Access via gate 2, meet the duty manager…" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> Text the guard as well as notifying their app</label>
          <DialogFooter className="dialog-footer-sticky">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!guardId || busy}>{busy ? "Dispatching…" : "Confirm dispatch"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SmsDialog({ alarm, contacts, onClose, onDone, onManage }: { alarm: Alarm | null; contacts: Contact[]; onClose: () => void; onDone: () => void; onManage: () => void }) {
  const act = useAct();
  const [idx, setIdx] = React.useState("0");
  const [customName, setCustomName] = React.useState("");
  const [customPhone, setCustomPhone] = React.useState("");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!alarm) return;
    setIdx(contacts.length ? "0" : "custom"); setCustomName(""); setCustomPhone(""); setBusy(false);
    setBody(`VIGILO ALERT — ${alarm.priority} ${alarm.type} at ${alarm.siteName}${alarm.zone ? `, ${alarm.zone}` : ""}. Triggered ${fmtTime(alarm.triggeredAt)}. Ref ${refLabel("ALM", alarm.ref)}.`);
  }, [alarm, contacts.length]);
  if (!alarm) return null;
  const sent = alarm.events.filter((e) => e.text.startsWith("SMS to "));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const to = idx === "custom" ? { name: customName, phone: customPhone } : contacts[Number(idx)];
    setBusy(true);
    const ok = await act(async () => {
      await api(`/api/alarms/${alarm!.id}`, { method: "POST", body: JSON.stringify({ action: "sms", ...to, body }) });
    }, "SMS sent", `${to.name} · ${to.phone}`);
    await onDone();
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send SMS alert</DialogTitle>
          <DialogDescription>Tell a third party about {refLabel("ALM", alarm.ref)}. Every message is recorded on the alarm.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-baseline justify-between"><Label htmlFor="to">Recipient</Label><button type="button" className="text-xs text-cyan hover:underline" onClick={onManage}>Manage contacts</button></div>
            <Select id="to" value={idx} onChange={(e) => setIdx(e.target.value)}>
              {contacts.map((c, i) => <option key={`${c.name}${c.phone}`} value={i}>{c.name} · {c.phone}</option>)}
              <option value="custom">Another number…</option>
            </Select>
          </div>
          {idx === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Name</Label><Input value={customName} onChange={(e) => setCustomName(e.target.value)} required /></div>
              <div className="space-y-1"><Label>Mobile (E.164)</Label><Input className="font-mono" placeholder="+61412345678" value={customPhone} onChange={(e) => setCustomPhone(e.target.value)} required pattern="\+\d{8,15}" /></div>
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between"><Label htmlFor="body">Message</Label><span className="num text-xs text-muted-foreground">{body.length} chars · {Math.max(1, Math.ceil(body.length / 153))} SMS</span></div>
            <Textarea id="body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} required maxLength={480} />
          </div>
          {sent.length > 0 && (
            <div className="rounded-md border bg-background/40 p-2.5">
              <div className="eyebrow mb-1.5">Already sent for this alarm</div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {sent.map((e) => <li key={e.id}><span className="font-mono">{fmtTime(e.at)}</span> · {e.text.split(":")[0]}</li>)}
              </ul>
            </div>
          )}
          <DialogFooter className="dialog-footer-sticky">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}><Send className="h-4 w-4" /> {busy ? "Sending…" : "Send SMS"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactsDialog({ open, onOpenChange, contacts, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; contacts: Contact[]; onDone: () => void }) {
  const act = useAct();
  const [rows, setRows] = React.useState<Contact[]>([]);
  const snapshot = React.useRef(contacts);
  React.useEffect(() => { snapshot.current = contacts; });
  React.useEffect(() => { if (open) setRows(snapshot.current.length ? snapshot.current : [{ name: "", phone: "" }]); }, [open]);
  const set = (i: number, k: keyof Contact, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await act(async () => {
      await api(`/api/alarms/contacts`, { method: "PUT", body: JSON.stringify({ contacts: rows.filter((r) => r.name.trim() || r.phone.trim()) }) });
      await onDone();
    }, "Contacts saved");
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>SMS contacts</DialogTitle>
          <DialogDescription>People outside the company who can be texted from an alarm: client emergency contacts, a police liaison, your regional manager.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_10.5rem_auto] gap-2">
              <Input placeholder="Name / role" value={r.name} onChange={(e) => set(i, "name", e.target.value)} />
              <Input placeholder="+61412345678" className="font-mono" value={r.phone} onChange={(e) => set(i, "phone", e.target.value)} />
              <Button type="button" variant="ghost" className="px-2 text-red-300" aria-label="Remove contact" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((r) => [...r, { name: "", phone: "" }])}><Plus className="h-3.5 w-3.5" /> Add contact</Button>
          <DialogFooter className="dialog-footer-sticky">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Save contacts</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function History({ alarms, loading }: { alarms: Alarm[]; loading: boolean }) {
  const [site, setSite] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [falseOnly, setFalseOnly] = React.useState(false);
  const rows = alarms.filter((a) => (!site || a.siteName === site) && (!priority || a.priority === priority) && (!falseOnly || a.verification === "FALSE_ALARM"));

  const mins = (a: Alarm) => (a.onSceneAt ? (+new Date(a.onSceneAt) - +new Date(a.triggeredAt)) / 60000 : null);
  const attended = rows.map(mins).filter((m): m is number => m !== null);
  const genuine = rows.filter((a) => a.verification !== "FALSE_ALARM");
  const within = genuine.filter((a) => responseSla(a).state !== "breached").length;

  const cols: Col<Alarm>[] = [
    { h: "Ref", c: (a) => <span className="font-mono text-xs">{refLabel("ALM", a.ref)}</span> },
    { h: "Triggered", c: (a) => <span className="whitespace-nowrap text-xs">{fmtDateTime(a.triggeredAt)}</span> },
    { h: "Site", c: (a) => <>{a.siteName}{a.zone ? <span className="text-muted-foreground"> · {a.zone}</span> : null}</> },
    { h: "Type", c: (a) => a.type },
    { h: "Priority", c: (a) => <StatusPill status={a.priority} /> },
    { h: "Response", c: (a) => { const m = mins(a); return m === null ? <span className="text-muted-foreground">—</span> : <span className="num">{m.toFixed(1)} min</span>; } },
    { h: "Duration", c: (a) => <span className="num text-xs">{a.resolvedAt ? elapsedLabel(+new Date(a.resolvedAt) - +new Date(a.triggeredAt)) : "—"}</span> },
    { h: "Outcome", c: (a) => <span className="text-xs text-muted-foreground">{a.verification === "FALSE_ALARM" ? "False alarm" : a.outcome}{a.resolvedBy ? ` · ${a.resolvedBy}` : ""}</span>, className: "max-w-[18rem]" },
  ];

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Alarms closed" value={rows.length} />
        <Stat label="Avg response" value={attended.length ? `${(attended.reduce((a, b) => a + b, 0) / attended.length).toFixed(1)} min` : "—"} sub="Trigger to guard on scene" />
        <Stat label="False alarms" value={rows.length ? `${Math.round(((rows.length - genuine.length) / rows.length) * 100)}%` : "—"} />
        <Stat label="Within response target" value={genuine.length ? `${Math.round((within / genuine.length) * 100)}%` : "—"} sub="Genuine alarms only" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select className="w-56" value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site">
          <option value="">All sites</option>
          {Array.from(new Set(alarms.map((a) => a.siteName))).sort().map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select className="w-40" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={falseOnly} onChange={(e) => setFalseOnly(e.target.checked)} /> False alarms only</label>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(`alarm-log-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((a) => ({
            Ref: refLabel("ALM", a.ref), Triggered: a.triggeredAt, Site: a.siteName, Zone: a.zone ?? "", Type: a.type, Priority: a.priority,
            "Response (min)": mins(a)?.toFixed(1) ?? "", Resolved: a.resolvedAt ?? "", "Resolved by": a.resolvedBy ?? "", "False alarm": a.verification === "FALSE_ALARM" ? "Y" : "N",
            "SMS sent": a.events.some((e) => e.text.startsWith("SMS to ")) ? "Y" : "N", Outcome: a.outcome ?? "",
          })))}
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>
      {loading ? <p className="text-muted-foreground">Loading…</p> : <DataTable cols={cols} rows={rows} empty="No resolved alarms yet." />}
    </>
  );
}
