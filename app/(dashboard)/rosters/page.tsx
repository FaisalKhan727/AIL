"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { RosterFormDialog } from "@/components/rosters/roster-form-dialog";
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
  const [open, setOpen] = React.useState(false);
  const { data: rosters = [], isLoading } = useQuery<RosterRow[]>({
    queryKey: ["rosters"],
    queryFn: () => api(`/api/rosters`),
  });
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
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && rosters.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No rosters yet.</TableCell></TableRow>}
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <RosterFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
