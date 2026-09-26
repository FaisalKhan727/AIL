"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw, RefreshCcw } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";
import { formatPhoneAU, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface SmsLog {
  id: string;
  guardId: string | null;
  shiftId: string | null;
  direction: string;
  fromNumber: string;
  toNumber: string;
  body: string;
  status: string | null;
  errorCode: string | null;
  receivedAt: string;
  guard: { id: string; firstName: string; lastName: string } | null;
}

// True Twilio delivery lifecycle: queued -> sent -> delivered, or -> failed /
// undelivered. The previous version of this page only distinguished
// "mock" / "received" / everything-else-is-green — so a genuinely FAILED
// send showed the same green "LIVE" badge as a delivered one, which is
// exactly backwards for a log an operator relies on to confirm a guard was
// actually notified.
function statusBadge(log: SmsLog) {
  if (log.direction === "INBOUND") {
    return <Badge className="bg-slate-100 text-slate-800 border-slate-300">Received</Badge>;
  }
  switch (log.status) {
    case "mock":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Mock</Badge>;
    case "delivered":
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Delivered</Badge>;
    case "sent":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Sent</Badge>;
    case "queued":
    case "accepted":
      return <Badge className="bg-slate-100 text-slate-700 border-slate-300">Queued</Badge>;
    case "failed":
    case "undelivered":
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300 font-semibold" title={log.errorCode ? `Twilio error ${log.errorCode}` : undefined}>
          {log.status === "failed" ? "Failed" : "Undelivered"}
        </Badge>
      );
    default:
      return <Badge className="bg-slate-100 text-slate-700 border-slate-300">{log.status ?? "Unknown"}</Badge>;
  }
}

export default function SmsLogPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [direction, setDirection] = React.useState<"" | "OUTBOUND" | "INBOUND">("");
  const [statusFilter, setStatusFilter] = React.useState<"" | "failed">("");
  const [q, setQ] = React.useState("");
  const [retryingId, setRetryingId] = React.useState<string | null>(null);

  const { data: logs = [], isLoading, isFetching, dataUpdatedAt } = useQuery<SmsLog[]>({
    queryKey: ["sms-log", direction],
    queryFn: () => {
      const p = new URLSearchParams();
      if (direction) p.set("direction", direction);
      p.set("limit", "200");
      return api(`/api/sms-log?${p.toString()}`);
    },
    refetchInterval: 5000,
  });

  const filtered = logs.filter((l) => {
    if (statusFilter === "failed" && l.status !== "failed" && l.status !== "undelivered") return false;
    if (!q) return true;
    const hay = `${l.body} ${l.fromNumber} ${l.toNumber} ${l.guard?.firstName ?? ""} ${l.guard?.lastName ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const failedCount = logs.filter((l) => l.status === "failed" || l.status === "undelivered").length;

  async function retry(log: SmsLog) {
    if (!log.shiftId) return;
    setRetryingId(log.id);
    try {
      await api(`/api/shifts/${log.shiftId}/resend`, { method: "POST" });
      toast({ title: "Resent", variant: "success" });
      qc.invalidateQueries({ queryKey: ["sms-log"] });
    } catch (e: unknown) {
      toast({ title: "Resend failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setRetryingId(null);
    }
  }

  const lastUpdatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <>
      <PageHeader
        title="SMS Log"
        description={
          lastUpdatedLabel
            ? `${filtered.length} message${filtered.length === 1 ? "" : "s"} · updated ${lastUpdatedLabel} · live every 5s`
            : `${filtered.length} message${filtered.length === 1 ? "" : "s"}`
        }
        actions={
          <Button variant="outline" size="icon" aria-label="Refresh" title="Refresh" onClick={() => qc.invalidateQueries({ queryKey: ["sms-log"] })} disabled={isFetching}>
            <RotateCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        }
      />
      <Card className="mb-4"><CardContent className="pt-6 flex flex-col sm:flex-row gap-3">
        <Input placeholder="Search body, phone, guard…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
        <Select value={direction} onChange={(e) => setDirection(e.target.value as "" | "OUTBOUND" | "INBOUND")} className="max-w-[180px]">
          <option value="">All directions</option>
          <option value="OUTBOUND">Outbound</option>
          <option value="INBOUND">Inbound</option>
        </Select>
        <button
          type="button"
          onClick={() => setStatusFilter((v) => (v === "failed" ? "" : "failed"))}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 h-10 text-sm font-medium transition-colors shrink-0",
            statusFilter === "failed"
              ? "bg-red-600 text-white border-red-600"
              : failedCount > 0
                ? "bg-red-50 text-red-700 border-red-300 hover:bg-red-100"
                : "bg-background text-muted-foreground border-input hover:bg-accent",
          )}
        >
          {failedCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
          Failed only{failedCount > 0 ? ` (${failedCount})` : ""}
        </button>
      </CardContent></Card>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>When</TableHead><TableHead>Dir</TableHead><TableHead>Guard</TableHead>
            <TableHead>From → To</TableHead><TableHead>Body</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableSkeletonRows columns={7} />}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No messages.</TableCell></TableRow>}
            {filtered.map((l) => {
              const failed = l.status === "failed" || l.status === "undelivered";
              return (
                <TableRow key={l.id} className={failed ? "bg-red-50/40" : undefined}>
                  <TableCell className="whitespace-nowrap">{fmtDateTime(l.receivedAt)}</TableCell>
                  <TableCell>
                    {l.direction === "OUTBOUND"
                      ? <Badge className="bg-blue-100 text-blue-800 border-blue-300">OUT</Badge>
                      : <Badge className="bg-purple-100 text-purple-800 border-purple-300">IN</Badge>}
                  </TableCell>
                  <TableCell>
                    {l.guard
                      ? <Link href={`/guards/${l.guard.id}`} className="hover:underline font-medium">{l.guard.firstName} {l.guard.lastName}</Link>
                      : <span className="text-muted-foreground">unknown</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{formatPhoneAU(l.fromNumber)} → {formatPhoneAU(l.toNumber)}</TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap text-xs">{l.body}</TableCell>
                  <TableCell>
                    {statusBadge(l)}
                    {failed && l.errorCode && <div className="text-[11px] text-red-700 mt-1">Error {l.errorCode}</div>}
                  </TableCell>
                  <TableCell>
                    {failed && l.shiftId && (
                      <Button size="sm" variant="outline" onClick={() => retry(l)} disabled={retryingId === l.id}>
                        <RefreshCcw className={cn("h-3 w-3", retryingId === l.id && "animate-spin")} /> Retry
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}
