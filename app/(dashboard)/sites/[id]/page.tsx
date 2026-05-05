"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SiteFormDialog } from "@/components/sites/site-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";

interface SiteDetail {
  id: string;
  name: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  active: boolean;
  shifts: Array<{ id: string; startAt: string; endAt: string; status: string; guard: { firstName: string; lastName: string } }>;
}

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [edit, setEdit] = React.useState(false);
  const { data, isLoading } = useQuery<SiteDetail>({
    queryKey: ["site", id],
    queryFn: () => api(`/api/sites/${id}`),
  });
  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-muted-foreground">Not found.</div>;

  return (
    <>
      <PageHeader
        title={data.name}
        description={data.address}
        actions={
          <>
            <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirm("Delete this site? Sites with shift history are kept as inactive instead of fully removed.")) return;
                try {
                  const r = await api<{ hardDeleted: boolean; shiftCount?: number }>(
                    `/api/sites/${id}`,
                    { method: "DELETE" },
                  );
                  toast({
                    title: r.hardDeleted
                      ? "Site deleted"
                      : `Site deactivated (${r.shiftCount ?? 0} shifts in history)`,
                    variant: "success",
                  });
                  router.push("/sites");
                } catch (e: unknown) {
                  toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </>
        }
      />
      {data.notes && <Card className="mb-4"><CardContent className="pt-6 text-sm text-muted-foreground">{data.notes}</CardContent></Card>}
      <Card>
        <CardHeader><CardTitle>Recent shifts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Guard</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.shifts.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No shifts.</TableCell></TableRow>}
              {data.shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{fmtDateTime(s.startAt)}</TableCell>
                  <TableCell>{fmtDateTime(s.endAt)}</TableCell>
                  <TableCell>{s.guard.firstName} {s.guard.lastName}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <SiteFormDialog
        open={edit}
        onOpenChange={setEdit}
        initial={{
          id: data.id, name: data.name, address: data.address,
          contactName: data.contactName ?? undefined, contactPhone: data.contactPhone ?? undefined,
          notes: data.notes ?? undefined, active: data.active,
        }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["site", id] })}
      />
    </>
  );
}
