"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, ShieldCheck, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/g/empty-state";
import { Skeleton } from "@/components/g/skeleton";
import {
  ShiftCardCompact,
  ShiftCardCompactSkeleton,
  type ShiftCardData,
} from "@/components/g/shift-card";

interface PendingSop {
  companyId: string;
  companyName: string;
  sop: { id: string; title: string; version: number };
}

interface ShiftApi {
  id: string;
  startAt: string;
  endAt: string;
  role: string | null;
  status: "PENDING";
  workedStart: string | null;
  workedEnd: string | null;
  site: { id: string; name: string; address: string };
  company: { id: string; name: string; brandColour: string | null } | null;
}

interface RecentMessage {
  id: string;
  body: string;
  receivedAt: string;
  status: string | null;
}

interface NotificationsResp {
  pendingSop: PendingSop[];
  pendingShifts: ShiftApi[];
  recentMessages: RecentMessage[];
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function NotificationsPage() {
  const router = useRouter();
  const [data, setData] = React.useState<NotificationsResp | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const res = await fetch("/api/g/notifications");
      if (res.status === 401) {
        router.replace("/g/sign-in");
        return;
      }
      if (!res.ok) return;
      setData(await res.json());
    } catch {
      /* swallow */
    }
  }, [router]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  async function respond(shiftId: string, action: "accept" | "reject") {
    try {
      const res = await fetch(`/api/g/shifts/${shiftId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "reject" ? JSON.stringify({ reason: prompt("Reject reason (optional):") ?? undefined }) : "{}",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${action} failed`);
      await reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : `${action} failed`);
    }
  }

  const hasActionable = (data?.pendingSop.length ?? 0) > 0 || (data?.pendingShifts.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-tabbar">
      <header className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Alerts</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Things that need your attention, and recent messages</p>
      </header>

      <div className="px-4 pt-4 space-y-6">
        {data === null ? (
          <>
            <Skeleton className="h-20 w-full rounded-2xl" />
            <ShiftCardCompactSkeleton />
          </>
        ) : (
          <>
            {hasActionable && (
              <section>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Needs your action</h2>
                <ul className="space-y-2">
                  {data.pendingSop.map((p) => (
                    <li key={p.companyId}>
                      <button
                        onClick={() => router.push("/g/sop")}
                        className="w-full flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-3 text-left active:scale-[0.99] transition"
                      >
                        <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                        <span className="text-sm text-amber-900 dark:text-amber-100">
                          <strong>{p.companyName}</strong> updated their SOP (v{p.sop.version}) — tap to review and acknowledge.
                        </span>
                      </button>
                    </li>
                  ))}
                  {data.pendingShifts.map((s) => (
                    <ShiftCardCompact
                      key={s.id}
                      shift={s as ShiftCardData}
                      showCompanyBadge={!!s.company}
                      onTap={() => router.push(`/g/shifts/${s.id}`)}
                      onAccept={() => void respond(s.id, "accept")}
                      onReject={() => void respond(s.id, "reject")}
                    />
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" /> Recent messages
              </h2>
              {data.recentMessages.length === 0 ? (
                !hasActionable ? (
                  <EmptyState
                    icon={Bell}
                    title="Nothing here yet"
                    description="Shift updates and messages from your roster manager will show up here."
                  />
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No messages yet.</p>
                )
              ) : (
                <ul className="space-y-2">
                  {data.recentMessages.map((m) => (
                    <li key={m.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{m.body}</p>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 whitespace-nowrap">{fmtWhen(m.receivedAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
