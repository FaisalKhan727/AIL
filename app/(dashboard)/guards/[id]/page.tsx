"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Send, Trash2, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuardFormDialog } from "@/components/guards/guard-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
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
      taxFreeThreshold: boolean | null;
      bankAccountName: string | null;
      bankBsbMasked: string | null;
      bankAccountNumberMasked: string | null;
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

export default function GuardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = React.useState(false);
  const [inviting, setInviting] = React.useState(false);
  const [sendingOnboard, setSendingOnboard] = React.useState(false);

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
                    masked · OWNER-only decrypt arrives in step 3
                  </span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="TFN" value={onboarding.data.taxBank.tfnMasked} />
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
                  <Field label="BSB" value={onboarding.data.taxBank.bankBsbMasked} />
                  <Field label="Account number" value={onboarding.data.taxBank.bankAccountNumberMasked} />
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
                  <div className="mt-3 flex gap-4">
                    {onboarding.data.licence.frontPhotoUrl && (
                      <a href={onboarding.data.licence.frontPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                        Front photo
                      </a>
                    )}
                    {onboarding.data.licence.backPhotoUrl && (
                      <a href={onboarding.data.licence.backPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                        Back photo
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">Photo upload arrives in step 4.</div>
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
