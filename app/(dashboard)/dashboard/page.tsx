"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users, Building2, Calendar, ClipboardList, MessageSquare, ShieldCheck, ShieldAlert, FileWarning, Radio, AlertTriangle, UserX, Send } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/fetcher";
import { fmtDateTime, fmtTime } from "@/lib/date";
import { formatPhoneAU, cn } from "@/lib/utils";

interface AttentionItem {
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description: string;
  link: string;
}

interface DashResp {
  kpis: {
    shiftsThisWeek: number;
    pendingCount: number;
    rejectedCount: number;
    activeGuards: number;
    onDutyCount: number;
    unfilledCount: number;
    lateCheckInCount: number;
  };
  attention: AttentionItem[];
  todayShifts: Array<{ id: string; startAt: string; endAt: string; status: string; guard: { id: string; firstName: string; lastName: string } | null; site: { id: string; name: string } }>;
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

const KPI_TONES = {
  navy: "bg-brand-navy/10 text-brand-navy",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  emerald: "bg-emerald-100 text-emerald-700",
} as const;

function Kpi({
  label,
  value,
  icon,
  tone = "navy",
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: keyof typeof KPI_TONES;
}) {
  return (
    <Card className="card-interactive">
      <CardContent className="pt-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
        </div>
        <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5", KPI_TONES[tone])}>
          {icon}
        </div>
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
  const [siteFilter, setSiteFilter] = React.useState("");
  const [guardFilter, setGuardFilter] = React.useState("");

  const siteOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of data?.todayShifts ?? []) map.set(s.site.id, s.site.name);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [data]);
  const guardOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of data?.todayShifts ?? []) if (s.guard) map.set(s.guard.id, `${s.guard.firstName} ${s.guard.lastName}`);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [data]);
  const filteredTodayShifts = React.useMemo(() => {
    return (data?.todayShifts ?? []).filter((s) => {
      if (siteFilter && s.site.id !== siteFilter) return false;
      if (guardFilter && s.guard?.id !== guardFilter) return false;
      return true;
    });
  }, [data, siteFilter, guardFilter]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Operational command centre — at-a-glance roster status"
        actions={
          <Button asChild><Link href="/rosters"><Plus className="h-4 w-4" /> New Roster</Link></Button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        <Button asChild variant="outline" size="sm"><Link href="/rosters"><Calendar className="h-4 w-4" /> Create roster</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href="/guards"><Users className="h-4 w-4" /> Add guard</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href="/sites"><Building2 className="h-4 w-4" /> Add site</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href="/sms-log?compose=1"><Send className="h-4 w-4" /> Send SMS</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href="/live"><Radio className="h-4 w-4" /> View today&apos;s shifts</Link></Button>
      </div>

      {isLoading && (
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      )}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <Kpi label="On duty now" value={data.kpis.onDutyCount} icon={<Radio />} tone="emerald" />
            <Kpi label="Shifts this week" value={data.kpis.shiftsThisWeek} icon={<Calendar />} tone="navy" />
            <Kpi label="Unfilled shifts" value={data.kpis.unfilledCount} icon={<UserX />} tone="rose" />
            <Kpi label="Pending confirmations" value={data.kpis.pendingCount} icon={<ClipboardList />} tone="amber" />
            <Kpi label="Rejected shifts" value={data.kpis.rejectedCount} icon={<MessageSquare />} tone="rose" />
            <Kpi label="Not checked in" value={data.kpis.lateCheckInCount} icon={<AlertTriangle />} tone="amber" />
          </div>

          {data.attention.length > 0 && (
            <Card className="mb-6 border-amber-300/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600" /> Attention required
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300">{data.attention.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.attention.slice(0, 8).map((item, i) => (
                  <Link
                    key={`${item.type}-${i}`}
                    href={item.link}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{item.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                    </div>
                    <Badge
                      className={
                        item.severity === "CRITICAL"
                          ? "bg-red-100 text-red-800 border-red-300 shrink-0"
                          : item.severity === "HIGH"
                            ? "bg-amber-100 text-amber-800 border-amber-300 shrink-0"
                            : "bg-slate-100 text-slate-700 border-slate-300 shrink-0"
                      }
                    >
                      {item.severity}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

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
              <CardHeader className="space-y-3">
                <CardTitle>Today&apos;s shifts</CardTitle>
                <div className="flex gap-2">
                  <Select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="h-8 text-xs">
                    <option value="">All sites</option>
                    {siteOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  <Select value={guardFilter} onChange={(e) => setGuardFilter(e.target.value)} className="h-8 text-xs">
                    <option value="">All guards</option>
                    {guardOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Time</TableHead><TableHead>Guard</TableHead><TableHead>Site</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredTodayShifts.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No shifts match.</TableCell></TableRow>}
                    {filteredTodayShifts.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{fmtTime(s.startAt)}–{fmtTime(s.endAt)}</TableCell>
                        <TableCell>{s.guard ? `${s.guard.firstName} ${s.guard.lastName}` : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                        <TableCell>{s.site.name}</TableCell>
                        <TableCell><StatusBadge status={s.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Recent SMS activity</span>
                  <Link href="/sms-log" className="text-xs font-normal text-brand-navy hover:underline">
                    View all in SMS Centre →
                  </Link>
                </CardTitle>
              </CardHeader>
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
