"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
  notes: string | null;
  active: boolean;
  shifts: Array<{ id: string; startAt: string; endAt: string; status: string; site: { name: string }; roster: { name: string } }>;
  smsLogs: Array<{ id: string; direction: string; body: string; receivedAt: string; status: string | null }>;
}

export default function GuardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = React.useState(false);

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
                if (!confirm("Mark this guard inactive?")) return;
                try {
                  await api(`/api/guards/${id}`, { method: "DELETE" });
                  toast({ title: "Guard deactivated", variant: "success" });
                  router.push("/guards");
                } catch (e: unknown) {
                  toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
                }
              }}
            >
              Deactivate
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
