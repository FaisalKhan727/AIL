"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { RosterFormDialog } from "@/components/rosters/roster-form-dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fmtDate } from "@/lib/date";

interface RosterRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  shiftCount: number;
  confirmedCount: number;
  rejectedCount: number;
  confirmationPct: number;
  publishedAt: string | null;
}

export default function RostersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const { data: rosters = [], isLoading } = useQuery<RosterRow[]>({
    queryKey: ["rosters"],
    queryFn: () => api(`/api/rosters`),
  });

  async function deleteRoster(r: RosterRow) {
    const shiftSuffix = r.shiftCount > 0 ? ` and all ${r.shiftCount} shift${r.shiftCount === 1 ? "" : "s"}` : "";
    if (!confirm(`Delete roster "${r.name}"${shiftSuffix}? This cannot be undone.`)) return;
    try {
      await api(`/api/rosters/${r.id}`, { method: "DELETE" });
      toast({ title: "Roster deleted", variant: "success" });
      qc.invalidateQueries({ queryKey: ["rosters"] });
    } catch (e: unknown) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  return (
    <>
      <PageHeader
        title="Rosters"
        description={`${rosters.length} roster${rosters.length === 1 ? "" : "s"}`}
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Roster</Button>}
      />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead>
            <TableHead>Shifts</TableHead><TableHead>Confirmed</TableHead><TableHead>Status</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && rosters.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No rosters yet.</TableCell></TableRow>}
            {rosters.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Link href={`/rosters/${r.id}`} className="font-medium hover:underline">{r.name}</Link></TableCell>
                <TableCell>{fmtDate(r.startDate)}</TableCell>
                <TableCell>{fmtDate(r.endDate)}</TableCell>
                <TableCell>{r.shiftCount}</TableCell>
                <TableCell>
                  <span className="text-emerald-700 font-medium">{r.confirmedCount}</span>
                  {r.rejectedCount > 0 && <> · <span className="text-red-700">{r.rejectedCount} rej</span></>}
                  <span className="text-muted-foreground ml-1">({r.confirmationPct}%)</span>
                </TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete roster"
                    onClick={() => deleteRoster(r)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <RosterFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
