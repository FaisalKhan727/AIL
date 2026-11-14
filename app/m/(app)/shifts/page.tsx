"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fmtInTz } from "@/lib/date";
import { cn } from "@/lib/utils";
import { type GuardShift, hoursBetween, shiftAction, shiftWhen } from "@/components/guard-app/shift-bits";

interface Resp { upcoming: GuardShift[]; past: GuardShift[] }

export default function GuardShifts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Resp>({ queryKey: ["m-shifts"], queryFn: () => api(`/api/m/shifts`), refetchInterval: 30_000 });
  const [tab, setTab] = React.useState<"upcoming" | "past">("upcoming");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [declining, setDeclining] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  async function respond(s: GuardShift, action: "confirm" | "decline") {
    setBusyId(s.id);
    try {
      await shiftAction(s.id, action, action === "decline" ? reason.trim() || undefined : undefined);
      toast({ title: action === "confirm" ? "Shift confirmed" : "Shift declined", description: `${shiftWhen(s).day} · ${s.site.name}`, variant: "success" });
      setDeclining(null);
      setReason("");
      await qc.invalidateQueries({ queryKey: ["m-shifts"] });
      qc.invalidateQueries({ queryKey: ["m-me"] });
    } catch (e) {
      toast({ title: "Couldn't update shift", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const list = tab === "upcoming" ? data?.upcoming : data?.past;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Shifts</h1>

      <div className="grid grid-cols-2 rounded-md border p-0.5 text-sm">
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("rounded py-2", tab === t ? "bg-primary/20 font-medium text-foreground" : "text-muted-foreground")}
          >
            {t === "upcoming" ? "Upcoming" : "History"}
            {data && <span className="num ml-1.5 text-xs opacity-70">{data[t].length}</span>}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {list && list.length === 0 && (
        <p className="rounded-[10px] border border-dashed p-6 text-center text-sm text-muted-foreground">
          {tab === "upcoming" ? "Nothing rostered yet." : "No shifts in the last five weeks."}
        </p>
      )}

      <ul className="space-y-3">
        {list?.map((s) => {
          const w = shiftWhen(s);
          return (
            <li key={s.id} className={cn("rounded-[10px] border bg-card p-3.5", s.status === "PENDING" && "border-warning/40", s.onShift && "border-success/50")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{w.day}</div>
                  <div className="num text-sm text-muted-foreground">{w.time}</div>
                </div>
                {s.onShift ? <span className="flex items-center gap-1.5 text-xs font-medium text-success"><span className="dot live" />On shift</span> : <StatusBadge status={s.status} />}
              </div>
              <div className="mt-2 text-sm">{s.site.name}{s.role ? <span className="text-muted-foreground"> · {s.role}</span> : null}</div>
              <div className="text-xs text-muted-foreground">{s.site.address}</div>
              {s.notes && tab === "upcoming" && <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs">{s.notes}</p>}

              {s.clockInAt && (
                <div className="num mt-2 border-t pt-2 text-xs text-muted-foreground">
                  In {fmtInTz(s.clockInAt, "HH:mm")}
                  {s.clockOutAt ? <> · Out {fmtInTz(s.clockOutAt, "HH:mm")} · {hoursBetween(s.clockInAt, s.clockOutAt)} on site</> : " · still on shift"}
                </div>
              )}

              {s.canRespond && declining !== s.id && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" disabled={busyId === s.id} onClick={() => { setDeclining(s.id); setReason(""); }}>Can&apos;t do it</Button>
                  <Button disabled={busyId === s.id} onClick={() => respond(s, "confirm")}>{busyId === s.id ? "Saving…" : "Confirm"}</Button>
                </div>
              )}
              {s.canRespond && declining === s.id && (
                <div className="mt-3 space-y-2">
                  <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setDeclining(null)}>Back</Button>
                    <Button variant="destructive" disabled={busyId === s.id} onClick={() => respond(s, "decline")}>Decline shift</Button>
                  </div>
                </div>
              )}
              {s.status === "PENDING" && !s.canRespond && tab === "upcoming" && (
                <p className="mt-2 text-xs text-muted-foreground">This shift has started. Call the office to confirm.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
