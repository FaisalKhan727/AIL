"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";
import { formatPhoneAU } from "@/lib/utils";

interface SmsLog {
  id: string;
  guardId: string | null;
  direction: string;
  fromNumber: string;
  toNumber: string;
  body: string;
  status: string | null;
  receivedAt: string;
  guard: { firstName: string; lastName: string } | null;
}

export default function SmsLogPage() {
  const [direction, setDirection] = React.useState<"" | "OUTBOUND" | "INBOUND">("");
  const [q, setQ] = React.useState("");

  const { data: logs = [], isLoading } = useQuery<SmsLog[]>({
    queryKey: ["sms-log", direction],
    queryFn: () => {
      const p = new URLSearchParams();
      if (direction) p.set("direction", direction);
      p.set("limit", "200");
      return api(`/api/sms-log?${p.toString()}`);
    },
    refetchInterval: 5000,
  });

  const filtered = q
    ? logs.filter((l) => {
        const hay = `${l.body} ${l.fromNumber} ${l.toNumber} ${l.guard?.firstName ?? ""} ${l.guard?.lastName ?? ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
    : logs;

  return (
    <>
      <PageHeader title="SMS Log" description={`${filtered.length} message${filtered.length === 1 ? "" : "s"} (live updates every 5s)`} />
      <Card className="mb-4"><CardContent className="pt-6 flex flex-col sm:flex-row gap-3">
        <Input placeholder="Search body, phone, guard…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
        <Select value={direction} onChange={(e) => setDirection(e.target.value as "" | "OUTBOUND" | "INBOUND")} className="max-w-[180px]">
          <option value="">All directions</option>
          <option value="OUTBOUND">Outbound</option>
          <option value="INBOUND">Inbound</option>
        </Select>
      </CardContent></Card>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>When</TableHead><TableHead>Dir</TableHead><TableHead>Guard</TableHead>
            <TableHead>From → To</TableHead><TableHead>Body</TableHead><TableHead>Mode</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No messages.</TableCell></TableRow>}
            {filtered.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap">{fmtDateTime(l.receivedAt)}</TableCell>
                <TableCell>
                  {l.direction === "OUTBOUND"
                    ? <Badge className="bg-blue-100 text-blue-800 border-blue-300">OUT</Badge>
                    : <Badge className="bg-purple-100 text-purple-800 border-purple-300">IN</Badge>}
                </TableCell>
                <TableCell>{l.guard ? `${l.guard.firstName} ${l.guard.lastName}` : <span className="text-muted-foreground">unknown</span>}</TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">{formatPhoneAU(l.fromNumber)} → {formatPhoneAU(l.toNumber)}</TableCell>
                <TableCell className="max-w-md whitespace-pre-wrap text-xs">{l.body}</TableCell>
                <TableCell>
                  {l.status === "mock"
                    ? <Badge className="bg-amber-100 text-amber-800 border-amber-300">MOCK</Badge>
                    : l.status === "received"
                      ? <Badge className="bg-slate-100 text-slate-800 border-slate-300">RX</Badge>
                      : <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">LIVE</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}
