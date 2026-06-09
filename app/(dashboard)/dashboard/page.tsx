"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users, Building2, Calendar, ClipboardList, MessageSquare, ShieldCheck, ShieldAlert, FileWarning } from "lucide-react";
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
  onboarding: {
    totalActive: number;
    breakdown: { NOT_STARTED: number; IN_PROGRESS: number; COMPLETE: number; EXPIRED: number };
    onboardedPct: number;
    sopReackPending: number;
  };
  workingRightsExpiring: Array<{
    guardId: string;
    guardName: string;
    visaSubclass: string | null;
    visaExpiry: string;
    daysUntil: number;
    severity: "EXPIRED" | "URGENT" | "WARN" | "OK";
  }>;
}

function severityBadge(severity: string, daysUntil: number) {
  const map: Record<string, string> = {
    EXPIRED: "bg-red-100 text-red-800 border-red-300",
    URGENT: "bg-red-100 text-red-800 border-red-300",
    WARN: "bg-amber-100 text-amber-800 border-amber-300",
    OK: "bg-slate-100 text-slate-700 border-slate-300",
  };
  const label =
    severity === "EXPIRED"
      ? `${Math.abs(daysUntil)}d overdue`
      : severity === "URGENT"
        ? `${daysUntil}d`
        : `${daysUntil}d`;
  return <Badge className={map[severity]}>{label}</Badge>;
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Onboarding overview</span>
                  <Badge className={data.onboarding.onboardedPct >= 80 ? "bg-emerald-100 text-emerald-800 border-emerald-300" : data.onboarding.onboardedPct >= 50 ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-red-100 text-red-800 border-red-300"}>
                    {data.onboarding.onboardedPct}% onboarded
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold">{data.onboarding.breakdown.COMPLETE}</span>
                  <span className="text-sm text-muted-foreground">/ {data.onboarding.totalActive} active guards complete</span>
                </div>

                {data.onboarding.totalActive > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      {(["COMPLETE", "IN_PROGRESS", "NOT_STARTED", "EXPIRED"] as const).map((key) => {
                        const pct = (data.onboarding.breakdown[key] / data.onboarding.totalActive) * 100;
                        if (pct === 0) return null;
                        const colour =
                          key === "COMPLETE"
                            ? "bg-emerald-500"
                            : key === "IN_PROGRESS"
                              ? "bg-amber-500"
                              : key === "NOT_STARTED"
                                ? "bg-slate-400"
                                : "bg-red-500";
                        return <div key={key} className={colour} style={{ width: `${pct}%` }} />;
                      })}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Complete · {data.onboarding.breakdown.COMPLETE}</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />In progress · {data.onboarding.breakdown.IN_PROGRESS}</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400" />Not started · {data.onboarding.breakdown.NOT_STARTED}</span>
                      {data.onboarding.breakdown.EXPIRED > 0 && (
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Expired · {data.onboarding.breakdown.EXPIRED}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <div className="rounded-lg p-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      SOP re-ack
                    </div>
                    <div className={`text-lg font-semibold mt-0.5 ${data.onboarding.sopReackPending > 0 ? "text-amber-700" : ""}`}>
                      {data.onboarding.sopReackPending}
                      <span className="text-xs text-muted-foreground font-normal ml-1.5">pending</span>
                    </div>
                  </div>
                  <Link href="/guards?onboardingStatus=IN_PROGRESS" className="rounded-lg p-2 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ClipboardList className="h-3.5 w-3.5" />
                      In progress
                    </div>
                    <div className="text-lg font-semibold mt-0.5">{data.onboarding.breakdown.IN_PROGRESS}</div>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Working rights expiring</span>
                  {data.workingRightsExpiring.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                      {data.workingRightsExpiring.length} guard{data.workingRightsExpiring.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.workingRightsExpiring.length === 0 ? (
                  <div className="px-6 pb-6 flex items-center gap-3 text-sm text-muted-foreground">
                    <FileWarning className="h-5 w-5 text-emerald-500" />
                    No working-visa expiry concerns in the next 60 days.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Guard</TableHead>
                        <TableHead>Visa</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>In</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.workingRightsExpiring.map((wr) => (
                        <TableRow key={wr.guardId}>
                          <TableCell>
                            <Link className="font-medium hover:underline" href={`/guards/${wr.guardId}`}>
                              {wr.guardName}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{wr.visaSubclass ?? "—"}</TableCell>
                          <TableCell className="text-xs">{new Date(wr.visaExpiry).toISOString().slice(0, 10)}</TableCell>
                          <TableCell>{severityBadge(wr.severity, wr.daysUntil)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
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
