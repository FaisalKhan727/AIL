"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { guardCompliance, type LicenceStatus } from "@/lib/licences";
import { LicenceStatusBadge, auDate, daysLabel } from "@/components/compliance/licence-status";
import { LicenceFormDialog } from "@/components/compliance/licence-form-dialog";
import { VerifyDialog } from "@/components/compliance/verify-dialog";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuardFormDialog } from "@/components/guards/guard-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";
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
  employmentType: string;
  payrollRef: string | null;
  notes: string | null;
  active: boolean;
  shifts: Array<{ id: string; startAt: string; endAt: string; status: string; site: { name: string }; roster: { name: string } }>;
  licences: Array<{ id: string; type: string; typeShort: string; number: string; state: string; expiryDate: string | null; daysLeft: number | null; status: LicenceStatus; verification: string }>;
  smsLogs: Array<{ id: string; direction: string; body: string; receivedAt: string; status: string | null }>;
}

export default function GuardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = React.useState(false);
  const [licOpen, setLicOpen] = React.useState(false);
  const [verifyId, setVerifyId] = React.useState<string | null>(null);
  const refreshLicences = () => {
    qc.invalidateQueries({ queryKey: ["guard", id] });
    qc.invalidateQueries({ queryKey: ["licences"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const { data, isLoading } = useQuery<GuardDetail>({
    queryKey: ["guard", id],
    queryFn: () => api(`/api/guards/${id}`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-muted-foreground">Not found.</div>;

  return (
    <>
      <PageHeader
        title={`${data.firstName} ${data.lastName}`}
        description={`${formatPhoneAU(data.phone)}${data.email ? ` · ${data.email}` : ""}`}
        actions={
          <>
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
        <Card><CardHeader><CardTitle className="text-sm">Clearance</CardTitle></CardHeader><CardContent>
          {(() => {
            const c = guardCompliance(data.licences.map((l) => ({ type: l.type, expiryDate: l.expiryDate, verification: l.verification })));
            return (
              <>
                {c.level === "block" && <Badge className="bg-red-500/15 text-red-700 border-red-500/40">Not cleared to work</Badge>}
                {c.level === "warn" && <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/40">Cleared · attention</Badge>}
                {c.level === "ok" && <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/40">Cleared to work</Badge>}
                <div className="text-xs text-muted-foreground mt-2">
                  {c.issues.length ? c.issues.map((i) => i.message).join(" · ") : "Security licence verified and current."}
                </div>
              </>
            );
          })()}
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
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Licences & certificates</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setLicOpen(true)}><Plus className="h-4 w-4" /> Add</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Credential</TableHead><TableHead>Number</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Verify</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.licences.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No licences on file.</TableCell></TableRow>}
              {data.licences.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.typeShort}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{l.number} <span className="text-muted-foreground">{l.state}</span></TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="num text-[13px]">{auDate(l.expiryDate)}</span>
                    {l.daysLeft !== null && l.daysLeft <= 60 && <span className="ml-2 text-xs text-amber-700">{daysLabel(l.daysLeft)}</span>}
                  </TableCell>
                  <TableCell><LicenceStatusBadge status={l.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant={l.status === "UNVERIFIED" ? "default" : "outline"} onClick={() => setVerifyId(l.id)}>
                      {l.status === "UNVERIFIED" ? "Review" : "Open"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
                  <TableCell>{l.status === "mock" ? <span className="text-amber-700 text-xs font-medium">MOCK</span> : l.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LicenceFormDialog
        open={licOpen}
        onOpenChange={setLicOpen}
        guards={[{ id: data.id, name: `${data.firstName} ${data.lastName}` }]}
        fixedGuardId={data.id}
        onSaved={refreshLicences}
      />
      <VerifyDialog licenceId={verifyId} onClose={() => setVerifyId(null)} onDone={refreshLicences} />

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
          employmentType: data.employmentType,
          payrollRef: data.payrollRef ?? undefined,
          notes: data.notes ?? undefined,
          active: data.active,
        }}
        onSaved={refreshLicences}
      />
    </>
  );
}
