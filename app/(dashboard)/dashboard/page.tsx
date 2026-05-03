"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users, Building2, Calendar, ClipboardList, MessageSquare, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/fetcher";
import { fmtDateTime, fmtTime } from "@/lib/date";
import { formatPhoneAU } from "@/lib/utils";

interface DashResp {
  kpis: { shiftsThisWeek: number; pendingCount: number; rejectedCount: number; activeGuards: number };
  todayShifts: Array<{ id: string; startAt: string; endAt: string; status: string; guard: { firstName: string; lastName: string }; site: { name: string } }>;
  recentSms: Array<{ id: string; body: string; direction: string; status: string | null; receivedAt: string; fromNumber: string; toNumber: string; guard: { firstName: string; lastName: string } | null }>;
}

function Kpi({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
        </div>
        <div className="text-brand-navy/40">{icon}</div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashResp>({
    queryKey: ["dashboard"],
    queryFn: () => api(`/api/dashboard`),
    refetchInterval: 5000,
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="At-a-glance roster status"
        actions={
          <>
            <Button asChild variant="outline"><Link href="/guards"><Users className="h-4 w-4" /> Add Guard</Link></Button>
            <Button asChild variant="outline"><Link href="/sites"><Building2 className="h-4 w-4" /> Add Site</Link></Button>
            <Button asChild><Link href="/rosters"><Plus className="h-4 w-4" /> New Roster</Link></Button>
            <Button asChild variant="amber"><Link href="/sms-simulator"><PlayCircle className="h-4 w-4" /> Simulate SMS</Link></Button>
          </>
        }
      />

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Shifts this week" value={data.kpis.shiftsThisWeek} icon={<Calendar className="h-8 w-8" />} />
            <Kpi label="Pending confirmations" value={data.kpis.pendingCount} icon={<ClipboardList className="h-8 w-8" />} />
            <Kpi label="Rejected upcoming" value={data.kpis.rejectedCount} icon={<MessageSquare className="h-8 w-8" />} />
            <Kpi label="Active guards" value={data.kpis.activeGuards} icon={<Users className="h-8 w-8" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Today&apos;s shifts</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Time</TableHead><TableHead>Guard</TableHead><TableHead>Site</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {data.todayShifts.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No shifts today.</TableCell></TableRow>}
                    {data.todayShifts.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{fmtTime(s.startAt)}–{fmtTime(s.endAt)}</TableCell>
                        <TableCell>{s.guard.firstName} {s.guard.lastName}</TableCell>
                        <TableCell>{s.site.name}</TableCell>
                        <TableCell><StatusBadge status={s.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent SMS activity</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>When</TableHead><TableHead>Dir</TableHead><TableHead>Guard / #</TableHead><TableHead>Body</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {data.recentSms.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No SMS yet.</TableCell></TableRow>}
                    {data.recentSms.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(l.receivedAt)}</TableCell>
                        <TableCell>
                          {l.direction === "OUTBOUND"
                            ? <Badge className="bg-blue-100 text-blue-800 border-blue-300">OUT</Badge>
                            : <Badge className="bg-purple-100 text-purple-800 border-purple-300">IN</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {l.guard ? `${l.guard.firstName} ${l.guard.lastName}` : <span className="font-mono">{formatPhoneAU(l.fromNumber)}</span>}
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate text-xs">{l.body}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
