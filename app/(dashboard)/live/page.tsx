"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Radio, Phone, ShieldAlert, AlertTriangle, Clock, MessageSquare, LogIn, LogOut as LogOutIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/fetcher";
import { fmtTime, fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";

interface ShiftRow {
  id: string;
  rosterId: string;
  startAt: string;
  endAt: string;
  workedStart: string | null;
  status: string;
  guard: { id: string; firstName: string; lastName: string; phone: string } | null;
  site: { id: string; name: string; address: string };
}
interface IncidentRow {
  id: string;
  guardId: string;
  incidentType: string;
  severity: string;
  status: string;
  occurredAt: string;
  guard: { firstName: string; lastName: string };
  site: { name: string } | null;
}
interface ResponderRow {
  id: string;
  responderType: string;
  externalName: string | null;
  externalPhone: string;
  acknowledgedAt: string | null;
  onsiteAt: string | null;
  offsiteAt: string | null;
}
interface AlarmRow {
  id: string;
  docket: string;
  siteName: string;
  alarmType: string;
  priority: string;
  status: string;
  receivedAt: string;
  responders: ResponderRow[];
}
interface TimelineItem {
  id: string;
  type: "CLOCK_IN" | "CLOCK_OUT" | "SMS_REPLY" | "INCIDENT";
  at: string;
  title: string;
  description: string;
  link?: string;
}
interface LiveResp {
  onDuty: ShiftRow[];
  dueSoon: ShiftRow[];
  missedCheckIns: ShiftRow[];
  openIncidents: IncidentRow[];
  activeAlarms: AlarmRow[];
  timeline: TimelineItem[];
}

const SEVERITY_CLASS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-900 border-red-300",
  HIGH: "bg-amber-100 text-amber-900 border-amber-300",
  MEDIUM: "bg-blue-100 text-blue-900 border-blue-300",
  LOW: "bg-slate-100 text-slate-700 border-slate-300",
};

function timelineIcon(type: TimelineItem["type"]) {
  switch (type) {
    case "CLOCK_IN":
      return <LogIn className="h-3.5 w-3.5 text-emerald-600" />;
    case "CLOCK_OUT":
      return <LogOutIcon className="h-3.5 w-3.5 text-slate-500" />;
    case "SMS_REPLY":
      return <MessageSquare className="h-3.5 w-3.5 text-blue-600" />;
    case "INCIDENT":
      return <ShieldAlert className="h-3.5 w-3.5 text-red-600" />;
  }
}

export default function LiveOperationsPage() {
  const { data, isLoading } = useQuery<LiveResp>({
    queryKey: ["live"],
    queryFn: () => api(`/api/live`),
    refetchInterval: 10_000,
  });

  return (
    <>
      <PageHeader
        title="Live Operations"
        description="Who's on duty, who's due, and what needs attention right now"
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5 text-emerald-500 animate-pulse" /> Live · refreshes every 10s
          </span>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-6">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">On duty</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums text-emerald-700">{data.onDuty.length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Due within 4h</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{data.dueSoon.length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Missed check-in</div>
              <div className={cn("text-2xl font-semibold mt-1 tabular-nums", data.missedCheckIns.length > 0 && "text-red-700")}>{data.missedCheckIns.length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active alarms</div>
              <div className={cn("text-2xl font-semibold mt-1 tabular-nums", data.activeAlarms.length > 0 && "text-amber-700")}>{data.activeAlarms.length}</div>
            </CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>On duty now</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.onDuty.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No one is clocked in right now.</p>}
                {data.onDuty.map((s) => (
                  <Link key={s.id} href={`/rosters/${s.rosterId}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{s.guard ? `${s.guard.firstName} ${s.guard.lastName}` : "Unassigned"}</div>
                      <div className="text-xs text-muted-foreground truncate">{s.site.name} · since {s.workedStart ? fmtTime(s.workedStart) : "—"}</div>
                    </div>
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Due on soon</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.dueSoon.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nothing starting in the next 4 hours.</p>}
                {data.dueSoon.map((s) => (
                  <Link key={s.id} href={`/rosters/${s.rosterId}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{s.guard ? `${s.guard.firstName} ${s.guard.lastName}` : "Unassigned"}</div>
                      <div className="text-xs text-muted-foreground truncate">{s.site.name}</div>
                    </div>
                    <div className="text-xs font-medium tabular-nums shrink-0">{fmtTime(s.startAt)}</div>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card className={data.missedCheckIns.length > 0 ? "border-red-300" : undefined}>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Missed check-ins</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.missedCheckIns.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Everyone confirmed has checked in.</p>}
                {data.missedCheckIns.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50/50 p-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{s.guard ? `${s.guard.firstName} ${s.guard.lastName}` : "Unassigned"}</div>
                      <div className="text-xs text-muted-foreground truncate">{s.site.name} · started {fmtTime(s.startAt)}</div>
                    </div>
                    {s.guard && (
                      <a href={`tel:${s.guard.phone}`} className="shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                        <Phone className="h-3.5 w-3.5" /> Call
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Open incidents &amp; active alarms</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.openIncidents.length === 0 && data.activeAlarms.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nothing open right now.</p>
                )}
                {data.activeAlarms.map((a) => (
                  <Link key={a.id} href={`/alarms/${a.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">#{a.docket} · {a.siteName}</div>
                      <div className="text-xs text-muted-foreground truncate">{a.alarmType} · {a.status}</div>
                    </div>
                    <Badge className={SEVERITY_CLASS[a.priority] ?? SEVERITY_CLASS.MEDIUM}>{a.priority}</Badge>
                  </Link>
                ))}
                {data.openIncidents.map((inc) => (
                  <Link key={inc.id} href={`/guards/${inc.guardId}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{inc.guard.firstName} {inc.guard.lastName} · {inc.incidentType}</div>
                      <div className="text-xs text-muted-foreground truncate">{inc.site?.name ?? "No site"} · {fmtDateTime(inc.occurredAt)}</div>
                    </div>
                    <Badge className={SEVERITY_CLASS[inc.severity] ?? SEVERITY_CLASS.MEDIUM}>{inc.severity}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Activity timeline</CardTitle></CardHeader>
            <CardContent>
              {data.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No activity in the last 12 hours.</p>
              ) : (
                <ol className="space-y-3">
                  {data.timeline.map((item) => (
                    <li key={`${item.type}-${item.id}`} className="flex items-start gap-3">
                      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted">
                        {timelineIcon(item.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-tight">
                          {item.link ? <Link href={item.link} className="hover:underline">{item.title}</Link> : item.title}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0 tabular-nums">{fmtTime(item.at)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
