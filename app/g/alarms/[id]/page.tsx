"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  AlertTriangle,
  Send,
  CheckCircle2,
  Clock,
  Building2,
  StickyNote,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/g/skeleton";

interface AlarmResponderSummary {
  id: string;
  dispatchedAt: string;
  acknowledgedAt: string | null;
  onsiteAt: string | null;
  offsiteAt: string | null;
  responseResult: string | null;
}

interface AlarmDetail {
  id: string;
  docket: string;
  source: string;
  sourceReference: string | null;
  alarmType: string;
  priority: string;
  status: string;
  siteName: string;
  siteAddress: string;
  siteLatitude: number | null;
  siteLongitude: number | null;
  receivedAt: string;
  description: string | null;
  specialInstructions: string | null;
  bureau: string | null;
  areaLabel: string | null;
  zoneLabel: string | null;
  resolvedAt: string | null;
  responders: AlarmResponderSummary[];
  replyToPhone: string | null;
}

function priorityClass(p: string): string {
  switch (p) {
    case "CRITICAL":
      return "bg-red-600 text-white";
    case "HIGH":
      return "bg-amber-500 text-white";
    case "MEDIUM":
      return "bg-blue-500 text-white";
    default:
      return "bg-slate-500 text-white";
  }
}

function statusClass(s: string): string {
  switch (s) {
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200";
    case "ONSITE":
      return "bg-cyan-100 text-cyan-900 dark:bg-cyan-500/20 dark:text-cyan-200";
    case "ACKNOWLEDGED":
      return "bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200";
    case "DISPATCHED":
      return "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200";
    case "CANCELLED":
    case "NO_RESPONSE":
      return "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300";
  }
}

function fmtTimeOfDay(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", "");
}

export default function GuardAlarmDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [alarm, setAlarm] = React.useState<AlarmDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/g/alarms/${id}`);
        if (res.status === 401) {
          router.replace("/g/sign-in");
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Alarm not found");
          return;
        }
        setAlarm(json as AlarmDetail);
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <BackBar />
        <div className="mt-8 mx-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 text-center">
          <p className="text-base font-medium text-slate-900 dark:text-slate-100">{error}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This alarm may have been cancelled or you may not be the dispatched responder.
          </p>
          <Button variant="outline" onClick={() => router.push("/g")} className="mt-4">
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  if (!alarm) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-12">
        <BackBar />
        <div className="mt-4 mx-4 space-y-3">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  const myResponder = alarm.responders[0] ?? null;
  const isClosed =
    alarm.status === "COMPLETED" ||
    alarm.status === "CANCELLED" ||
    alarm.status === "NO_RESPONSE";
  const hasOnsite = Boolean(myResponder?.onsiteAt);
  const hasOffsite = Boolean(myResponder?.offsiteAt);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alarm.siteAddress)}`;

  // Pre-fill SMS reply with the most useful template the guard can edit.
  // Use AU local "now" as a default time hint that the responder can adjust.
  const nowHHmm = fmtTimeOfDay(new Date());
  const smsTemplate = hasOnsite
    ? `OFFSITE ${nowHHmm} ALL GOOD AND SECURE`
    : `ONSITE ${nowHHmm} `;
  const smsHref = alarm.replyToPhone
    ? `sms:${encodeURIComponent(alarm.replyToPhone)}?body=${encodeURIComponent(smsTemplate)}`
    : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32">
      <BackBar onClick={() => router.back()} />

      {/* Hero header */}
      <div className="mx-4 mt-2 rounded-2xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className={cn("px-5 py-4 text-white relative", priorityClass(alarm.priority))}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider opacity-90 font-medium">
                {alarm.priority} · {alarm.alarmType}
              </p>
              <h1 className="font-mono text-2xl font-bold mt-1">#{alarm.docket}</h1>
            </div>
            <span className={cn("text-xs uppercase tracking-wider font-medium px-2 py-1 rounded-full", statusClass(alarm.status), "bg-white/95 text-slate-900")}>
              {alarm.status.replace("_", " ")}
            </span>
          </div>
        </div>
        <div className="px-5 py-3">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{alarm.siteName}</p>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <MapPin className="h-3.5 w-3.5" /> {alarm.siteAddress}
          </a>
        </div>
      </div>

      {/* Description */}
      {alarm.description && (
        <Section icon={AlertTriangle} title="What's happening">
          {alarm.description}
        </Section>
      )}

      {/* Special instructions — highlighted because gate codes etc. are critical */}
      {alarm.specialInstructions && (
        <div className="mx-4 mt-3 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-200 mb-1">
            <Key className="h-3.5 w-3.5" />
            Special instructions
          </div>
          <p className="text-sm text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{alarm.specialInstructions}</p>
        </div>
      )}

      {/* Source + bureau */}
      <Section icon={Building2} title="Source">
        {alarm.source}
        {alarm.sourceReference && <span className="text-slate-500 dark:text-slate-400"> · {alarm.sourceReference}</span>}
        {alarm.bureau && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">via {alarm.bureau}</p>
        )}
        {alarm.zoneLabel && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Zone: {alarm.zoneLabel}</p>
        )}
      </Section>

      {/* Received time */}
      <Section icon={Clock} title="Received">
        {new Date(alarm.receivedAt).toLocaleString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })}
      </Section>

      {/* Your response status (if any) */}
      {myResponder && (hasOnsite || hasOffsite) && (
        <Section icon={CheckCircle2} title="Your response">
          {myResponder.onsiteAt && (
            <p>Onsite at {new Date(myResponder.onsiteAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
          )}
          {myResponder.offsiteAt && (
            <p>Offsite at {new Date(myResponder.offsiteAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
          )}
          {myResponder.responseResult && (
            <p className="mt-1 text-slate-700 dark:text-slate-300">&ldquo;{myResponder.responseResult}&rdquo;</p>
          )}
        </Section>
      )}

      {/* Reply via SMS — only when the alarm is still open and we have a phone */}
      {!isClosed && smsHref && (
        <div className="mx-4 mt-4 rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-900 dark:text-blue-200 mb-1">
            <StickyNote className="h-3.5 w-3.5" />
            How to respond
          </div>
          <p className="text-sm text-blue-900 dark:text-blue-100 mb-2">
            Reply via SMS with your onsite + offsite times and the result.
          </p>
          <p className="text-xs font-mono bg-blue-100 dark:bg-blue-900/40 px-2 py-1.5 rounded text-blue-900 dark:text-blue-100 mb-3">
            Eg: ONSITE 1147 OFFSITE 1213 ALL GOOD AND SECURE
          </p>
          <a
            href={smsHref}
            className="inline-flex items-center justify-center w-full h-11 rounded-lg bg-blue-600 text-white font-medium text-sm active:scale-[0.98] transition"
          >
            <Send className="h-4 w-4 mr-2" />
            {hasOnsite ? "Send offsite + result" : "Send onsite time"}
          </a>
        </div>
      )}

      {/* Closed-state copy */}
      {isClosed && (
        <div className="mx-4 mt-4 rounded-xl bg-slate-100 dark:bg-slate-800 p-3 text-center text-sm text-slate-600 dark:text-slate-400">
          This alarm has been closed.
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function BackBar({ onClick }: { onClick?: () => void }) {
  return (
    <div className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 active:scale-95 transition"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof MapPin;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-4 mt-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 flex items-start gap-3">
      <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <div className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{children}</div>
      </div>
    </div>
  );
}
