"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Clock,
  User,
  StickyNote,
  Navigation,
  CheckCircle2,
  XCircle,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/g/skeleton";
import { StatusPill } from "@/components/g/status-pill";
import { companyColour, timeUntil, type ShiftStatus } from "@/lib/g/design";

interface ShiftDetail {
  id: string;
  startAt: string;
  endAt: string;
  role: string | null;
  notes: string | null;
  status: ShiftStatus;
  site: { id: string; name: string; address: string };
  rosterName: string;
  company: { id: string; name: string; brandColour: string | null };
  timeline: {
    publishedAt: string | null;
    confirmedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    workedStart: string | null;
    workedEnd: string | null;
  };
}

export default function ShiftDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [shift, setShift] = React.useState<ShiftDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [respondingTo, setRespondingTo] = React.useState<"accept" | "reject" | null>(null);
  const [clockBusy, setClockBusy] = React.useState(false);

  // Clock in/out: try GPS, never block on it. Server returns updated shift;
  // we refetch the full detail to pick up the new timeline event.
  async function clockAction(action: "clock-in" | "clock-out") {
    if (clockBusy) return;
    setClockBusy(true);
    let body: Record<string, number> = {};
    try {
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          () => resolve(null),
          { maximumAge: 60_000, timeout: 5000, enableHighAccuracy: false },
        );
      });
      if (pos) body = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch(`/api/g/shifts/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `${action} failed`);
      }
      // Refresh the detail to pick up new timeline events + status.
      const refreshed = await fetch(`/api/g/shifts/${id}`);
      if (refreshed.ok) setShift((await refreshed.json()) as ShiftDetail);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setClockBusy(false);
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/g/shifts/${id}`);
        if (res.status === 401) {
          router.replace("/g/sign-in");
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Shift not found");
          return;
        }
        setShift(json as ShiftDetail);
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  async function respond(action: "accept" | "reject", reason?: string) {
    if (!shift || respondingTo) return;
    const prevStatus = shift.status;
    // Optimistic flip
    setShift({
      ...shift,
      status: action === "accept" ? "CONFIRMED" : "REJECTED",
      timeline: {
        ...shift.timeline,
        confirmedAt: action === "accept" ? new Date().toISOString() : shift.timeline.confirmedAt,
        rejectedAt: action === "reject" ? new Date().toISOString() : shift.timeline.rejectedAt,
        rejectionReason: action === "reject" ? reason ?? null : shift.timeline.rejectionReason,
      },
    });
    setRespondingTo(action);
    try {
      const res = await fetch(`/api/g/shifts/${shift.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "reject" ? JSON.stringify({ reason }) : "{}",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${action} failed`);
      }
      // Re-fetch to get authoritative state + server timestamps
      const refreshed = await fetch(`/api/g/shifts/${shift.id}`).then((r) => r.json());
      setShift(refreshed as ShiftDetail);
    } catch (e: unknown) {
      // Roll back optimistic change
      setShift((s) => (s ? { ...s, status: prevStatus } : s));
      alert(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setRespondingTo(null);
    }
  }

  // ---------- render ----------

  if (error) {
    return (
      <div className="px-4 pt-6 pb-12 max-w-md mx-auto">
        <BackBar onClick={() => router.back()} />
        <div className="mt-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 text-center">
          <p className="text-base font-medium text-slate-900 dark:text-slate-100">
            {error}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This shift may have been cancelled or assigned to someone else.
          </p>
          <Button variant="outline" onClick={() => router.push("/g")} className="mt-4">
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="max-w-md mx-auto pb-12">
        <BackBar />
        <div className="mt-4 mx-4 space-y-3">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  const stripe = companyColour(shift.company.brandColour, shift.company.id);
  const start = new Date(shift.startAt);
  const end = new Date(shift.endAt);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.site.address)}`;

  return (
    <div className="max-w-md mx-auto pb-32 dark:bg-slate-950 min-h-screen">
      <BackBar onClick={() => router.back()} />

      {/* Hero header with company colour gradient */}
      <div
        className="mx-4 mt-2 rounded-2xl overflow-hidden text-white relative"
        style={{
          background: `linear-gradient(135deg, ${stripe}, ${stripe}dd)`,
        }}
      >
        <div className="px-5 py-5">
          <p className="text-xs font-medium opacity-80 uppercase tracking-wider">
            {shift.company.name}
          </p>
          <h1 className="mt-1 text-xl font-semibold">{shift.site.name}</h1>
          <p className="mt-2 text-sm opacity-90">
            {start.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <p className="text-lg font-medium">
            {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} –{" "}
            {end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <StatusPill status={shift.status} size="md" />
            {start.getTime() > Date.now() && (
              <span className="text-xs opacity-90 inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Starts {timeUntil(start)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 mt-4 space-y-3">
        <DetailRow icon={MapPin} label="Address">
          <span className="block">{shift.site.address}</span>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Navigation className="h-3 w-3" /> Open in Maps
          </a>
        </DetailRow>

        {shift.role && (
          <DetailRow icon={User} label="Role">
            {shift.role}
          </DetailRow>
        )}

        {shift.notes && (
          <DetailRow icon={StickyNote} label="Notes from admin">
            <span className="whitespace-pre-wrap">{shift.notes}</span>
          </DetailRow>
        )}

        <DetailRow icon={Clock} label="Roster">
          {shift.rosterName}
        </DetailRow>
      </div>

      {/* Timeline */}
      <div className="px-4 mt-6">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Timeline</h3>
        <ul className="space-y-2.5 ml-1">
          {shift.timeline.publishedAt && (
            <TimelineEvent
              when={shift.timeline.publishedAt}
              dotColour="#94A3B8"
              label="Published to you"
              icon={Send}
            />
          )}
          {shift.timeline.confirmedAt && (
            <TimelineEvent
              when={shift.timeline.confirmedAt}
              dotColour="#10B981"
              label="You accepted"
              icon={CheckCircle2}
            />
          )}
          {shift.timeline.rejectedAt && (
            <TimelineEvent
              when={shift.timeline.rejectedAt}
              dotColour="#EF4444"
              label={
                shift.timeline.rejectionReason
                  ? `You declined — "${shift.timeline.rejectionReason}"`
                  : "You declined"
              }
              icon={XCircle}
            />
          )}
          {shift.timeline.workedStart && (
            <TimelineEvent
              when={shift.timeline.workedStart}
              dotColour="#0891B2"
              label="Clock in"
              icon={Clock}
            />
          )}
          {shift.timeline.workedEnd && (
            <TimelineEvent
              when={shift.timeline.workedEnd}
              dotColour="#0891B2"
              label="Clock out"
              icon={Clock}
            />
          )}
          {!shift.timeline.publishedAt && (
            <li className="text-xs text-slate-400 dark:text-slate-500">No events yet.</li>
          )}
        </ul>
      </div>

      {/* Sticky bottom action bar */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-20",
          "bg-white/95 dark:bg-slate-900/95 backdrop-blur",
          "border-t border-slate-200 dark:border-slate-700",
          "px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
        )}
      >
        <div className="max-w-md mx-auto">
          {shift.status === "PENDING" && (
            <div className="flex gap-2">
              <Button
                className="flex-1 h-11 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white"
                onClick={() => void respond("accept")}
                disabled={!!respondingTo}
              >
                Accept shift
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => {
                  const reason = prompt("Decline reason (optional):") ?? undefined;
                  void respond("reject", reason);
                }}
                disabled={!!respondingTo}
              >
                Decline
              </Button>
            </div>
          )}
          {shift.status === "CONFIRMED" && !shift.timeline.workedStart && (
            <div className="space-y-2">
              <Button
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => void clockAction("clock-in")}
                disabled={clockBusy}
              >
                {clockBusy ? "Clocking in…" : "Clock in"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  const reason = prompt("Change to declined — reason?") ?? undefined;
                  if (reason !== undefined) void respond("reject", reason);
                }}
                className="block w-full text-center text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 hover:underline"
              >
                Can&apos;t make it? Change to decline
              </button>
            </div>
          )}
          {shift.status === "CONFIRMED" && shift.timeline.workedStart && !shift.timeline.workedEnd && (
            <div className="space-y-2">
              <p className="text-center text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                ⏱ Clocked in at {new Date(shift.timeline.workedStart).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
              <Button
                className="w-full h-11 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white"
                onClick={() => void clockAction("clock-out")}
                disabled={clockBusy}
              >
                {clockBusy ? "Clocking out…" : "Clock out"}
              </Button>
            </div>
          )}
          {shift.status === "REJECTED" && (
            <Button
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => void respond("accept")}
              disabled={!!respondingTo}
            >
              Reconsider — accept
            </Button>
          )}
          {(shift.status === "WORKED" || shift.status === "NO_SHOW" || shift.status === "CANCELLED") && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-1">
              This shift is closed.
            </p>
          )}
        </div>
      </div>
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

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 flex items-start gap-3">
      <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider font-medium text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <div className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{children}</div>
      </div>
    </div>
  );
}

function TimelineEvent({
  when,
  dotColour,
  label,
  icon: Icon,
}: {
  when: string;
  dotColour: string;
  label: string;
  icon: typeof Clock;
}) {
  const d = new Date(when);
  const formatted = d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <li className="flex items-start gap-3">
      <div className="flex h-6 w-6 items-center justify-center rounded-full shrink-0" style={{ backgroundColor: dotColour }}>
        <Icon className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm text-slate-800 dark:text-slate-200">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formatted} · {time}
        </p>
      </div>
    </li>
  );
}
