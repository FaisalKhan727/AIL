"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, FileText, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { LicenceStatusBadge, auDate, daysLabel } from "@/components/compliance/licence-status";
import type { LicenceStatus, PreCheck } from "@/lib/licences";
import type { RegisterResult } from "@/lib/licence-register";

interface Detail {
  id: string;
  guardName: string;
  typeLabel: string;
  security: boolean;
  number: string;
  state: string;
  issueDate: string | null;
  expiryDate: string | null;
  daysLeft: number | null;
  status: LicenceStatus;
  verification: string;
  source: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  verifyNote: string | null;
  document: { name: string; mime: string; uploadedAt: string } | null;
  events: { id: string; at: string; actor: string; action: string; detail: string | null }[];
}

interface CheckResp { checks: PreCheck[]; register: RegisterResult }

const SOURCE_LABEL: Record<string, string> = { GUARD: "Uploaded by guard", ADMIN: "Entered by office", IMPORT: "Imported from guard record" };
const EVENT_LABEL: Record<string, string> = {
  CREATED: "Added", UPDATED: "Updated", DOCUMENT: "Document attached", REGISTER_CHECK: "Register lookup",
  VERIFIED: "Verified", REJECTED: "Rejected", ALERT: "Reminder",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export function VerifyDialog({ licenceId, onClose, onDone }: { licenceId: string | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const open = Boolean(licenceId);

  const detail = useQuery<Detail>({
    queryKey: ["licence", licenceId],
    queryFn: () => api(`/api/licences/${licenceId}`),
    enabled: open,
  });
  // The automatic checks (and the register lookup, where a state has an API)
  // run as soon as the panel opens.
  const check = useQuery<CheckResp>({
    queryKey: ["licence-check", licenceId],
    queryFn: () => api(`/api/licences/${licenceId}/check`, { method: "POST" }),
    enabled: open,
    staleTime: Infinity,
    retry: false,
  });

  const [note, setNote] = React.useState("");
  const [attest, setAttest] = React.useState(false);
  const [busy, setBusy] = React.useState<"VERIFIED" | "REJECTED" | null>(null);
  React.useEffect(() => { setNote(""); setAttest(false); setBusy(null); }, [licenceId]);

  const l = detail.data;
  const reg = check.data?.register;
  const apiConfirmed = reg?.outcome === "CONFIRMED";
  const failedChecks = check.data?.checks.filter((c) => !c.pass) ?? [];

  async function decide(decision: "VERIFIED" | "REJECTED") {
    if (!l) return;
    if (decision === "REJECTED" && note.trim().length < 3) {
      toast({ title: "Add a reason", description: "The guard is told why their licence was rejected.", variant: "error" });
      return;
    }
    setBusy(decision);
    try {
      // Record how it was verified: the register API said so, an operator
      // looked it up on the public register, or the document was sighted.
      const method = apiConfirmed ? "API" : l.security ? "REGISTER" : "MANUAL";
      const r = await api<{ smsSent: boolean }>(`/api/licences/${l.id}/verify`, {
        method: "POST",
        body: JSON.stringify({ decision, method, note: note.trim() || undefined }),
      });
      toast({
        title: decision === "VERIFIED" ? "Licence verified" : "Licence rejected",
        description: decision === "REJECTED" ? (r.smsSent ? "The guard has been notified by SMS." : "SMS to the guard could not be sent.") : `${l.guardName} — ${l.typeLabel}`,
        variant: decision === "VERIFIED" ? "success" : "default",
      });
      onDone();
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save decision", description: e instanceof Error ? e.message : "", variant: "error" });
      setBusy(null);
    }
  }

  const docUrl = l?.document ? `/api/licences/${l.id}/document?v=${encodeURIComponent(l.document.uploadedAt)}` : null;
  const canVerify = Boolean(l) && !busy && (apiConfirmed || attest);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:!max-w-4xl">
        <DialogHeader>
          <DialogTitle>Verify licence</DialogTitle>
          <DialogDescription>
            {l ? `${l.guardName} · ${SOURCE_LABEL[l.source] ?? l.source}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {l && (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {/* Left: what we hold */}
            <div className="space-y-4">
              <div className="overflow-hidden rounded-md border bg-background/50">
                {docUrl && l.document?.mime.startsWith("image/") ? (
                  <a href={docUrl} target="_blank" rel="noreferrer" title="Open full size">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={docUrl} alt={`${l.typeLabel} document`} className="max-h-72 w-full object-contain" />
                  </a>
                ) : docUrl ? (
                  <a href={docUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-4 text-sm text-cyan hover:underline">
                    <FileText className="h-4 w-4" /> {l.document?.name} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No document on file. Ask the guard to upload one from the app, or attach it with Edit.
                  </div>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2"><Field label="Credential">{l.typeLabel}</Field></div>
                <Field label="Number"><span className="font-mono">{l.number}</span></Field>
                <Field label="State">{l.state}</Field>
                <Field label="Issued">{auDate(l.issueDate)}</Field>
                <Field label="Expires">
                  {auDate(l.expiryDate)}
                  {l.daysLeft !== null && <span className="ml-1.5 text-xs text-muted-foreground">({daysLabel(l.daysLeft)})</span>}
                </Field>
                <Field label="Status"><LicenceStatusBadge status={l.status} /></Field>
                {l.verifiedBy && (
                  <Field label={l.verification === "REJECTED" ? "Rejected by" : "Verified by"}>
                    {l.verifiedBy}{l.verifiedAt ? `, ${fmtDateTime(l.verifiedAt)}` : ""}
                  </Field>
                )}
              </dl>
            </div>

            {/* Right: checks and decision */}
            <div className="space-y-4">
              <section>
                <div className="eyebrow mb-2">Automatic checks</div>
                {check.isLoading && <p className="text-sm text-muted-foreground">Running checks…</p>}
                {check.isError && <p className="text-sm text-red-700">Checks could not be run. You can still review the document.</p>}
                <ul className="space-y-1.5">
                  {check.data?.checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-2 text-sm">
                      <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm", c.pass ? "bg-emerald-500/20 text-emerald-700" : "bg-amber-500/20 text-amber-700")}>
                        {c.pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      </span>
                      <span><span className="font-medium">{c.label}.</span> <span className="text-muted-foreground">{c.detail}</span></span>
                    </li>
                  ))}
                </ul>
              </section>

              {reg && (
                <section className={cn(
                  "rounded-md border p-3 text-sm",
                  reg.outcome === "CONFIRMED" && "border-emerald-500/40 bg-emerald-500/10",
                  (reg.outcome === "MISMATCH" || reg.outcome === "NOT_FOUND") && "notice-danger",
                  reg.outcome === "ERROR" && "notice-warn",
                )}>
                  <div className="eyebrow mb-1">{reg.source}</div>
                  <p>{reg.summary}</p>
                  {(reg.registerName || reg.registerStatus) && (
                    <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                      {[reg.registerName, reg.registerStatus, reg.registerExpiry && `exp ${reg.registerExpiry}`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">Regulator: {reg.regulator}</p>
                  {reg.lookupUrl && reg.outcome !== "CONFIRMED" && (
                    <a href={reg.lookupUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-cyan hover:underline">
                      Open the {l.state} public register <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </section>
              )}

              {!apiConfirmed && (
                <label className="flex items-start gap-2.5 text-sm">
                  <input type="checkbox" className="mt-1" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
                  <span>
                    {l.security
                      ? "I checked this licence with the regulator. The holder's name, licence number, class and expiry match."
                      : "I have sighted this document and the details above match it."}
                  </span>
                </label>
              )}

              <div className="space-y-1">
                <div className="eyebrow">Note {failedChecks.length > 0 && <span className="normal-case tracking-normal text-amber-700">— a check above needs explaining</span>}</div>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required when rejecting. Sent to the guard." />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" className="text-red-700 hover:text-red-800" disabled={Boolean(busy)} onClick={() => decide("REJECTED")}>
                  {busy === "REJECTED" ? "Rejecting…" : "Reject"}
                </Button>
                <Button disabled={!canVerify} onClick={() => decide("VERIFIED")}>
                  <Check className="h-4 w-4" /> {busy === "VERIFIED" ? "Saving…" : l.verification === "VERIFIED" ? "Re-verify" : "Mark verified"}
                </Button>
              </div>

              {l.events.length > 0 && (
                <section className="border-t pt-3">
                  <div className="eyebrow mb-2">History</div>
                  <ol className="space-y-1.5">
                    {l.events.map((e) => (
                      <li key={e.id} className="grid grid-cols-[7.5rem_1fr] gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">{fmtDateTime(e.at)}</span>
                        <span>
                          <span className="font-medium">{EVENT_LABEL[e.action] ?? e.action}</span>
                          <span className="text-muted-foreground"> · {e.actor}{e.detail ? ` · ${e.detail}` : ""}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
