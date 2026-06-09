"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Send, Trash2, ClipboardCheck, Eye, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuardFormDialog } from "@/components/guards/guard-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/fetcher";
import { fmtDateTime, fmtIso } from "@/lib/date";
import { formatPhoneAU } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface GuardDetail {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  licenceNumber: string | null;
  licenceExpiry: string | null;
  payRate: string | null;
  notes: string | null;
  active: boolean;
  shifts: Array<{ id: string; startAt: string; endAt: string; status: string; site: { name: string }; roster: { name: string } }>;
  smsLogs: Array<{ id: string; direction: string; body: string; receivedAt: string; status: string | null }>;
}

type SensitiveField = "tfn" | "bsb" | "accountNumber";

interface OnboardingView {
  hasSession: boolean;
  sessionId?: string;
  status?: string;
  currentStep?: number;
  startedAt?: string;
  lastSeenAt?: string | null;
  expiresAt?: string;
  sessionCompletedAt?: string | null;
  guardCompletedAt?: string | null;
  onboardingStatus: string;
  viewerRole: string;
  data?: {
    personal: {
      legalName: string | null;
      dateOfBirth: string | null;
      residentialAddress: string | null;
      mobile: string | null;
      email: string | null;
      emergencyContactName: string | null;
      emergencyContactPhone: string | null;
    };
    workingRights: {
      status: string | null;
      visaSubclass: string | null;
      visaExpiry: string | null;
      visaHoursPerFortnight: number | null;
    };
    taxBank: {
      tfnMasked: string | null;
      tfnEncrypted: boolean;
      taxFreeThreshold: boolean | null;
      bankAccountName: string | null;
      bankBsbMasked: string | null;
      bankBsbEncrypted: boolean;
      bankAccountNumberMasked: string | null;
      bankAccountNumberEncrypted: boolean;
    };
    licence: {
      number: string | null;
      class: string | null;
      expiry: string | null;
      frontPhotoUrl: string | null;
      backPhotoUrl: string | null;
    };
    sop: {
      versionLabel: string | null;
      acknowledgedAt: string | null;
    };
    contract: {
      templateLabel: string | null;
      signatureName: string | null;
      signedAt: string | null;
      signerIp: string | null;
      signerUserAgent: string | null;
      contractPdfReady: boolean;
      packagePdfReady: boolean;
    };
  } | null;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}

function SensitiveFieldCell({
  label,
  masked,
  encrypted,
  revealed,
  canReveal,
  onReveal,
}: {
  label: string;
  field: SensitiveField;
  masked: string | null;
  encrypted: boolean;
  revealed: string | undefined;
  canReveal: boolean;
  onReveal: () => void;
}) {
  if (revealed !== undefined) {
    return (
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-mono text-amber-700">{revealed}</div>
        <div className="text-[10px] text-amber-700/80 mt-0.5">Auto-hides in 30s</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm flex items-center gap-2">
        <span>{masked ?? "—"}</span>
        {masked && encrypted && canReveal && (
          <button
            type="button"
            onClick={onReveal}
            className="text-xs underline text-blue-600 hover:text-blue-800"
          >
            Reveal
          </button>
        )}
      </div>
    </div>
  );
}

export default function GuardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = React.useState(false);
  const [inviting, setInviting] = React.useState(false);
  const [sendingOnboard, setSendingOnboard] = React.useState(false);

  // Reveal flow state. `revealing` = which field is currently in the
  // reason dialog. `revealedValues` = plaintexts that are currently
  // visible; each entry auto-clears after REVEAL_TTL_MS.
  const REVEAL_TTL_MS = 30_000;
  const [revealing, setRevealing] = React.useState<SensitiveField | null>(null);
  const [revealReason, setRevealReason] = React.useState("");
  const [revealing_submitting, setRevealingSubmitting] = React.useState(false);
  const [revealedValues, setRevealedValues] = React.useState<Partial<Record<SensitiveField, string>>>({});
  const revealTimers = React.useRef<Partial<Record<SensitiveField, number>>>({});

  React.useEffect(() => {
    const timers = revealTimers.current;
    return () => {
      Object.values(timers).forEach((t) => t && clearTimeout(t));
    };
  }, []);

  async function confirmReveal() {
    if (!revealing || revealReason.trim().length < 10 || revealing_submitting) return;
    setRevealingSubmitting(true);
    try {
      const r = await api<{ tfn?: string | null; bsb?: string | null; accountNumber?: string | null }>(
        `/api/guards/${id}/onboarding/decrypt`,
        {
          method: "POST",
          body: JSON.stringify({ fields: [revealing], reason: revealReason.trim() }),
          headers: { "Content-Type": "application/json" },
        },
      );
      const value = r[revealing];
      if (typeof value !== "string") {
        toast({ title: "No value to reveal for that field.", variant: "error" });
        return;
      }
      setRevealedValues((prev) => ({ ...prev, [revealing]: value }));
      if (revealTimers.current[revealing]) {
        clearTimeout(revealTimers.current[revealing]);
      }
      revealTimers.current[revealing] = window.setTimeout(() => {
        setRevealedValues((prev) => {
          const next = { ...prev };
          delete next[revealing];
          return next;
        });
        delete revealTimers.current[revealing];
      }, REVEAL_TTL_MS);
      toast({ title: "Revealed — auto-hides in 30 seconds. Logged to audit.", variant: "success" });
      setRevealing(null);
      setRevealReason("");
    } catch (e: unknown) {
      toast({
        title: "Reveal failed",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setRevealingSubmitting(false);
    }
  }

  function startReveal(field: SensitiveField) {
    setRevealing(field);
    setRevealReason("");
  }

  const [pdfBusy, setPdfBusy] = React.useState<"contract" | "package" | null>(null);
  async function downloadPdf(which: "contract" | "package", regen: boolean = false) {
    if (pdfBusy) return;
    setPdfBusy(which);
    try {
      const r = await api<{ url: string; regenerated: boolean }>(
        `/api/guards/${id}/onboarding/pdf?which=${which}${regen ? "&regen=1" : ""}`,
      );
      window.open(r.url, "_blank", "noopener");
      if (regen) {
        toast({ title: `${which === "contract" ? "Contract" : "Package"} PDF regenerated`, variant: "success" });
        qc.invalidateQueries({ queryKey: ["guard-onboarding", id] });
      }
    } catch (e: unknown) {
      toast({
        title: "PDF download failed",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setPdfBusy(null);
    }
  }

  const { data, isLoading } = useQuery<GuardDetail>({
    queryKey: ["guard", id],
    queryFn: () => api(`/api/guards/${id}`),
  });

  const { data: onboarding } = useQuery<OnboardingView>({
    queryKey: ["guard-onboarding", id],
    queryFn: () => api(`/api/guards/${id}/onboarding`),
  });

  async function sendAppInvite() {
    if (inviting) return;
    setInviting(true);
    try {
      const r = await api<{ ok: true; alreadyActivated: boolean }>(
        `/api/guards/${id}/send-app-invite`,
        { method: "POST" },
      );
      toast({
        title: r.alreadyActivated
          ? "Reminder SMS sent — guard already activated the app"
          : "Setup link sent via SMS (valid for 7 days)",
        variant: "success",
      });
    } catch (e: unknown) {
      toast({
        title: "Failed to send invite",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setInviting(false);
    }
  }

  async function sendOnboardingLink() {
    if (sendingOnboard) return;
    setSendingOnboard(true);
    try {
      await api(`/api/guards/${id}/send-onboarding-link`, { method: "POST" });
      toast({ title: "Onboarding link sent via SMS (valid for 7 days)", variant: "success" });
      qc.invalidateQueries({ queryKey: ["guard", id] });
    } catch (e: unknown) {
      toast({
        title: "Failed to send onboarding link",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setSendingOnboard(false);
    }
  }

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-muted-foreground">Not found.</div>;

  return (
    <>
      <PageHeader
        title={`${data.firstName} ${data.lastName}`}
        description={`${formatPhoneAU(data.phone)}${data.email ? ` · ${data.email}` : ""}`}
        actions={
          <>
            <Button variant="outline" onClick={sendAppInvite} disabled={inviting}>
              <Send className="h-4 w-4" /> {inviting ? "Sending…" : "Send app invite"}
            </Button>
            <Button variant="outline" onClick={sendOnboardingLink} disabled={sendingOnboard}>
              <ClipboardCheck className="h-4 w-4" /> {sendingOnboard ? "Sending…" : "Send onboarding link"}
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirm("Delete this guard? Guards with shift history are kept as inactive instead of fully removed.")) return;
                try {
                  const r = await api<{ hardDeleted: boolean; shiftCount?: number }>(
                    `/api/guards/${id}`,
                    { method: "DELETE" },
                  );
                  toast({
                    title: r.hardDeleted
                      ? "Guard deleted"
                      : `Guard deactivated (${r.shiftCount ?? 0} shifts in history)`,
                    variant: "success",
                  });
                  qc.invalidateQueries({ queryKey: ["guards"] });
                  qc.invalidateQueries({ queryKey: ["guard", id] });
                  router.push("/guards");
                } catch (e: unknown) {
                  toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "error" });
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card><CardHeader><CardTitle className="text-sm">Licence</CardTitle></CardHeader><CardContent>
          <div className="text-sm">{data.licenceNumber || "—"}</div>
          <div className="text-xs text-muted-foreground">Expires: {data.licenceExpiry ? new Date(data.licenceExpiry).toISOString().slice(0, 10) : "—"}</div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Pay Rate</CardTitle></CardHeader><CardContent>
          <div className="text-2xl font-semibold">{data.payRate ? `$${Number(data.payRate).toFixed(2)}` : "—"}</div>
          <div className="text-xs text-muted-foreground">per hour</div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader><CardContent>
          <StatusBadge status={data.active ? "ACTIVE" : "INACTIVE"} />
          {data.notes && <p className="text-xs text-muted-foreground mt-2">{data.notes}</p>}
        </CardContent></Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Onboarding submission</span>
            {onboarding?.hasSession && onboarding.status && (
              <StatusBadge status={onboarding.status} />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!onboarding ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !onboarding.hasSession ? (
            <div className="text-sm text-muted-foreground">
              No onboarding link sent yet. Use “Send onboarding link” above to start.
            </div>
          ) : !onboarding.data ? (
            <div className="text-sm text-muted-foreground">
              Link sent · {onboarding.status === "PENDING" ? "guard hasn’t opened it yet." : "no data captured yet."}
              {onboarding.expiresAt && (
                <> Expires {fmtDateTime(onboarding.expiresAt)}.</>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <div>Step <span className="text-foreground font-medium">{onboarding.currentStep}</span> of 7</div>
                {onboarding.guardCompletedAt && (
                  <div>Completed <span className="text-foreground font-medium">{fmtDateTime(onboarding.guardCompletedAt)}</span></div>
                )}
                {onboarding.lastSeenAt && (
                  <div>Last seen {fmtDateTime(onboarding.lastSeenAt)}</div>
                )}
                {onboarding.expiresAt && (
                  <div>Link expires {fmtDateTime(onboarding.expiresAt)}</div>
                )}
              </div>

              <section>
                <h3 className="text-sm font-semibold mb-2">Personal</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Legal name" value={onboarding.data.personal.legalName} />
                  <Field label="Date of birth" value={onboarding.data.personal.dateOfBirth ? fmtIso(onboarding.data.personal.dateOfBirth) : null} />
                  <Field label="Residential address" value={onboarding.data.personal.residentialAddress} />
                  <Field label="Mobile" value={onboarding.data.personal.mobile} />
                  <Field label="Email" value={onboarding.data.personal.email} />
                  <Field
                    label="Emergency contact"
                    value={
                      onboarding.data.personal.emergencyContactName
                        ? `${onboarding.data.personal.emergencyContactName} · ${onboarding.data.personal.emergencyContactPhone ?? "—"}`
                        : null
                    }
                  />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Working rights</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Status" value={onboarding.data.workingRights.status} />
                  {onboarding.data.workingRights.status === "WORKING_VISA" && (
                    <>
                      <Field label="Visa subclass" value={onboarding.data.workingRights.visaSubclass} />
                      <Field label="Visa expiry" value={onboarding.data.workingRights.visaExpiry ? fmtIso(onboarding.data.workingRights.visaExpiry) : null} />
                      <Field label="Hours / fortnight" value={onboarding.data.workingRights.visaHoursPerFortnight} />
                    </>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">
                  Tax &amp; bank
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {onboarding.viewerRole === "OWNER"
                      ? "encrypted · click Reveal to decrypt (logged to audit, auto-hides 30s)"
                      : "encrypted · OWNER role can decrypt with a logged reason"}
                  </span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <SensitiveFieldCell
                    label="TFN"
                    field="tfn"
                    masked={onboarding.data.taxBank.tfnMasked}
                    encrypted={onboarding.data.taxBank.tfnEncrypted}
                    revealed={revealedValues.tfn}
                    canReveal={onboarding.viewerRole === "OWNER"}
                    onReveal={() => startReveal("tfn")}
                  />
                  <Field
                    label="Tax-free threshold"
                    value={
                      onboarding.data.taxBank.taxFreeThreshold === null
                        ? null
                        : onboarding.data.taxBank.taxFreeThreshold
                          ? "Claimed here"
                          : "Not claimed"
                    }
                  />
                  <Field label="Bank account name" value={onboarding.data.taxBank.bankAccountName} />
                  <SensitiveFieldCell
                    label="BSB"
                    field="bsb"
                    masked={onboarding.data.taxBank.bankBsbMasked}
                    encrypted={onboarding.data.taxBank.bankBsbEncrypted}
                    revealed={revealedValues.bsb}
                    canReveal={onboarding.viewerRole === "OWNER"}
                    onReveal={() => startReveal("bsb")}
                  />
                  <SensitiveFieldCell
                    label="Account number"
                    field="accountNumber"
                    masked={onboarding.data.taxBank.bankAccountNumberMasked}
                    encrypted={onboarding.data.taxBank.bankAccountNumberEncrypted}
                    revealed={revealedValues.accountNumber}
                    canReveal={onboarding.viewerRole === "OWNER"}
                    onReveal={() => startReveal("accountNumber")}
                  />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Licence</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Number" value={onboarding.data.licence.number} />
                  <Field label="Class" value={onboarding.data.licence.class} />
                  <Field label="Expiry" value={onboarding.data.licence.expiry ? fmtIso(onboarding.data.licence.expiry) : null} />
                </div>
                {(onboarding.data.licence.frontPhotoUrl || onboarding.data.licence.backPhotoUrl) ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 max-w-md">
                    {(["frontPhotoUrl", "backPhotoUrl"] as const).map((key) => {
                      const url = onboarding.data!.licence[key];
                      const label = key === "frontPhotoUrl" ? "Front" : "Back";
                      if (!url) {
                        return (
                          <div key={key} className="rounded border border-dashed border-slate-300 h-32 flex items-center justify-center text-xs text-muted-foreground">
                            {label} not uploaded
                          </div>
                        );
                      }
                      return (
                        <a
                          key={key}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block group"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`${label} of licence`}
                            className="w-full h-32 object-contain rounded border bg-slate-50 group-hover:ring-2 group-hover:ring-blue-400"
                          />
                          <div className="text-[10px] text-center text-muted-foreground mt-1">
                            {label} · click to view full size
                          </div>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">No photos uploaded yet.</div>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">SOP acknowledgement</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Version" value={onboarding.data.sop.versionLabel} />
                  <Field label="Acknowledged at" value={onboarding.data.sop.acknowledgedAt ? fmtDateTime(onboarding.data.sop.acknowledgedAt) : null} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Contract</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Template" value={onboarding.data.contract.templateLabel} />
                  <Field label="Typed signature" value={onboarding.data.contract.signatureName} />
                  <Field label="Signed at" value={onboarding.data.contract.signedAt ? fmtDateTime(onboarding.data.contract.signedAt) : null} />
                  <Field label="Signer IP" value={onboarding.data.contract.signerIp} />
                </div>
                {(onboarding.data.contract.contractPdfReady || onboarding.data.contract.packagePdfReady) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {onboarding.data.contract.contractPdfReady && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadPdf("contract")}
                        disabled={pdfBusy === "contract"}
                      >
                        {pdfBusy === "contract" ? "Opening…" : "Download signed contract"}
                      </Button>
                    )}
                    {onboarding.data.contract.packagePdfReady && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadPdf("package")}
                        disabled={pdfBusy === "package"}
                      >
                        {pdfBusy === "package" ? "Opening…" : "Download full package"}
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => downloadPdf(onboarding.data!.contract.contractPdfReady ? "contract" : "package", true)}
                      disabled={!!pdfBusy}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      Regenerate
                    </button>
                  </div>
                )}
                {(!onboarding.data.contract.contractPdfReady && !onboarding.data.contract.packagePdfReady && onboarding.status === "COMPLETED") && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadPdf("contract", true)}
                      disabled={!!pdfBusy}
                    >
                      {pdfBusy ? "Generating…" : "Generate contract PDF"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadPdf("package", true)}
                      disabled={!!pdfBusy}
                    >
                      Generate package PDF
                    </Button>
                  </div>
                )}
              </section>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle>Shift history</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Roster</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.shifts.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No shifts.</TableCell></TableRow>}
              {data.shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.roster.name}</TableCell>
                  <TableCell>{fmtDateTime(s.startAt)}</TableCell>
                  <TableCell>{fmtDateTime(s.endAt)}</TableCell>
                  <TableCell>{s.site.name}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>SMS log</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Body</TableHead>
              <TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.smsLogs.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No SMS yet.</TableCell></TableRow>}
              {data.smsLogs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap">{fmtDateTime(l.receivedAt)}</TableCell>
                  <TableCell>{l.direction}</TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap text-xs">{l.body}</TableCell>
                  <TableCell>{l.status === "mock" ? <span className="text-amber-600 text-xs font-medium">MOCK</span> : l.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={revealing !== null} onOpenChange={(o) => { if (!o) { setRevealing(null); setRevealReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Reveal {revealing === "tfn" ? "TFN" : revealing === "bsb" ? "BSB" : "account number"}
            </DialogTitle>
            <DialogDescription>
              The plaintext will be visible for 30 seconds. Every reveal is recorded in the
              audit log with your name, the field, and the reason you enter below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reveal-reason">Reason (min 10 characters)</Label>
            <Textarea
              id="reveal-reason"
              value={revealReason}
              onChange={(e) => setRevealReason(e.target.value)}
              placeholder="e.g. Setting up payroll in Xero for first pay cycle"
              rows={3}
              autoFocus
            />
            <div className="text-xs text-muted-foreground">
              {revealReason.trim().length}/10 chars minimum
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRevealing(null); setRevealReason(""); }}
              disabled={revealing_submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmReveal}
              disabled={revealReason.trim().length < 10 || revealing_submitting}
            >
              <Eye className="h-4 w-4" /> {revealing_submitting ? "Revealing…" : "Reveal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GuardFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={{
          id: data.id,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          email: data.email ?? undefined,
          licenceNumber: data.licenceNumber ?? undefined,
          licenceExpiry: data.licenceExpiry ? new Date(data.licenceExpiry).toISOString().slice(0, 10) : undefined,
          payRate: data.payRate ? String(data.payRate) : undefined,
          notes: data.notes ?? undefined,
          active: data.active,
        }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["guard", id] })}
      />
    </>
  );
}
