"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fmtInTz } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { ComplianceResult } from "@/lib/licences";
import { type GuardShift, shiftAction, shiftWhen, useElapsed } from "@/components/guard-app/shift-bits";

interface Me {
  guard: { firstName: string };
  companyName: string;
  compliance: ComplianceResult;
  pendingCount: number;
  activeShift: GuardShift | null;
  upcoming: GuardShift[];
}

function SiteLine({ shift }: { shift: GuardShift }) {
  return (
    <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
      <a
        className="flex items-start gap-2 hover:text-foreground"
        href={`https://maps.google.com/?q=${encodeURIComponent(shift.site.address)}`}
        target="_blank"
        rel="noreferrer"
      >
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {shift.site.address}
      </a>
      {shift.site.contactPhone && (
        <a className="flex items-center gap-2 hover:text-foreground" href={`tel:${shift.site.contactPhone}`}>
          <Phone className="h-4 w-4 shrink-0" /> {shift.site.contactName || "Site contact"} · {shift.site.contactPhone}
        </a>
      )}
    </div>
  );
}

export default function GuardHome() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Me>({ queryKey: ["m-me"], queryFn: () => api(`/api/m/me`), refetchInterval: 30_000 });
  const [busy, setBusy] = React.useState(false);
  const elapsed = useElapsed(data?.activeShift?.clockInAt ?? null);
  // An alarm dispatch outranks everything else on this screen.
  const work = useQuery<{ dispatches: { id: string; type: string; site: { name: string } }[] }>({ queryKey: ["m-work"], queryFn: () => api(`/api/m/work`), refetchInterval: 15_000 });

  async function clock(shift: GuardShift, action: "clock-in" | "clock-out") {
    if (action === "clock-out" && !confirm("Clock out and end this shift?")) return;
    setBusy(true);
    try {
      const { located } = await shiftAction(shift.id, action);
      toast({
        title: action === "clock-in" ? "Clocked in" : "Clocked out",
        description: located ? `${shift.site.name} · location recorded` : `${shift.site.name} · no location (permission off)`,
        variant: "success",
      });
      await qc.invalidateQueries({ queryKey: ["m-me"] });
      qc.invalidateQueries({ queryKey: ["m-shifts"] });
    } catch (e) {
      toast({ title: "Couldn't do that", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !data) return <p className="text-muted-foreground">Loading…</p>;

  const active = data.activeShift;
  const next = data.upcoming.find((s) => s.id !== active?.id);
  const today = fmtInTz(new Date(), "EEEE d MMMM");

  return (
    <div className="space-y-4">
      <div>
        <div className="eyebrow">{today} · {data.companyName}</div>
        <h1 className="mt-1 font-display text-2xl font-bold">Hi {data.guard.firstName}</h1>
      </div>

      {work.data?.dispatches.map((d) => (
        <Link key={d.id} href="/m/work" className="alarm-critical flex items-center gap-3 rounded-[10px] border p-3.5 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-800" />
          <span className="flex-1"><span className="block font-semibold">Alarm dispatch: {d.type}</span><span className="block opacity-90">{d.site.name} — tap to respond</span></span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Link>
      ))}

      {data.compliance.level !== "ok" && (
        <Link
          href="/m/licences"
          className={cn("flex items-start gap-3 rounded-[10px] border p-3 text-sm", data.compliance.level === "block" ? "notice-danger" : "notice-warn")}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            <span className="font-medium">
              {data.compliance.level === "block" ? "You can't be rostered right now" : "A licence needs attention"}
            </span>
            <span className="block opacity-90">{data.compliance.issues[0]?.message}</span>
          </span>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
        </Link>
      )}

      {active ? (
        <section className="rounded-[10px] border border-success/50 bg-success/[0.07] p-4">
          <div className="flex items-center gap-2 text-success">
            <span className="dot live" />
            <span className="eyebrow !text-success">On shift</span>
          </div>
          <div className="num mt-2 text-[40px] font-medium leading-none" aria-live="off">{elapsed}</div>
          <div className="mt-3 text-base font-semibold">{active.site.name}</div>
          <div className="text-sm text-muted-foreground">
            Rostered {shiftWhen(active).time}{active.role ? ` · ${active.role}` : ""} · in at {fmtInTz(active.clockInAt as string, "HH:mm")}
          </div>
          <SiteLine shift={active} />
          <Button
            variant="outline"
            className="mt-4 h-12 w-full border-success/50 text-base"
            disabled={busy || !active.canClockOut}
            onClick={() => clock(active, "clock-out")}
          >
            {busy ? "Clocking out…" : "Clock out"}
          </Button>
          {!active.canClockOut && <p className="mt-2 text-xs text-muted-foreground">This shift ended a while ago. Ask the office to close it.</p>}
        </section>
      ) : next ? (
        <section className="rounded-[10px] border bg-card p-4">
          <div className="eyebrow">Next shift</div>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="text-lg font-semibold">{shiftWhen(next).day}</span>
            <span className="num text-lg">{shiftWhen(next).time}</span>
          </div>
          <div className="mt-1 text-base">{next.site.name}{next.role ? <span className="text-muted-foreground"> · {next.role}</span> : null}</div>
          <SiteLine shift={next} />
          {next.notes && <p className="mt-3 rounded-md bg-muted/50 p-2.5 text-sm">{next.notes}</p>}
          {next.status === "PENDING" ? (
            <Button asChild className="mt-4 h-12 w-full text-base"><Link href="/m/shifts">Confirm this shift</Link></Button>
          ) : (
            <>
              <Button className="mt-4 h-12 w-full text-base" disabled={busy || !next.canClockIn} onClick={() => clock(next, "clock-in")}>
                {busy ? "Clocking in…" : "Clock in"}
              </Button>
              {!next.canClockIn && (
                <p className="mt-2 text-center text-xs text-muted-foreground">Clock-in opens 30 minutes before the start.</p>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="rounded-[10px] border border-dashed p-6 text-center text-sm text-muted-foreground">
          No upcoming shifts. You&apos;ll get an SMS when a roster is published.
        </section>
      )}

      {data.pendingCount > 0 && (
        <Link href="/m/shifts" className="flex items-center justify-between rounded-[10px] border border-warning/40 bg-warning/10 p-3.5 text-sm">
          <span>
            <span className="num font-semibold text-warning">{data.pendingCount}</span>{" "}
            shift{data.pendingCount === 1 ? "" : "s"} waiting for your answer
          </span>
          <ChevronRight className="h-4 w-4 text-warning" />
        </Link>
      )}

      {data.upcoming.filter((s) => s.id !== active?.id && s.id !== next?.id).length > 0 && (
        <section>
          <div className="eyebrow mb-2">Coming up</div>
          <ul className="divide-y rounded-[10px] border bg-card">
            {data.upcoming.filter((s) => s.id !== active?.id && s.id !== next?.id).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span>
                  <span className="font-medium">{shiftWhen(s).day}</span>
                  <span className="block text-muted-foreground">{s.site.name}</span>
                </span>
                <span className="num text-muted-foreground">{shiftWhen(s).time}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
