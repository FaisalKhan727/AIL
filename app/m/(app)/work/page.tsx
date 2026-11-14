"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FilePlus2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { fmtTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { StatusPill, auDate, useAct } from "@/components/ops/kit";

export interface WorkResp {
  dispatches: { id: string; ref: string; type: string; priority: string; zone: string | null; status: string; etaMins: number | null; dispatchedAt: string | null; site: { name: string; address: string } }[];
  patrols: { id: string; code: string; name: string; date: string; status: string; stopCount: number; done: number }[];
  training: { id: string; title: string; category: string; mandatory: boolean; status: string; score: number | null; dueAt: string | null; expiresAt: string | null }[];
  sites: { id: string; name: string; address: string }[];
}

export default function GuardWork() {
  const qc = useQueryClient();
  const act = useAct();
  const { data, isLoading } = useQuery<WorkResp>({ queryKey: ["m-work"], queryFn: () => api(`/api/m/work`), refetchInterval: 15_000 });
  const [busy, setBusy] = React.useState(false);

  async function respond(id: string, action: "en-route" | "on-scene") {
    setBusy(true);
    await act(async () => { await api(`/api/m/alarms/${id}`, { method: "POST", body: JSON.stringify({ action }) }); await qc.invalidateQueries({ queryKey: ["m-work"] }); }, action === "en-route" ? "Control room notified: en route" : "Control room notified: on scene");
    setBusy(false);
  }

  if (isLoading || !data) return <p className="text-muted-foreground">Loading…</p>;
  const openTraining = data.training.filter((t) => t.status !== "PASSED");
  const passed = data.training.filter((t) => t.status === "PASSED");

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">Tasks</h1>

      {data.dispatches.map((d) => (
        <section key={d.id} className={cn("rounded-[10px] border p-4", d.status === "DISPATCHED" ? "alarm-critical" : "border-critical/60 bg-critical/[0.07]")}>
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow !text-red-800">Alarm dispatch · {d.ref}</span>
            <StatusPill status={d.priority} />
          </div>
          <div className="mt-2 text-lg font-semibold leading-snug">{d.type}</div>
          <div className="text-base">{d.site.name}{d.zone ? ` · ${d.zone}` : ""}</div>
          <a className="mt-2 flex items-start gap-2 text-sm text-muted-foreground hover:text-foreground" href={`https://maps.google.com/?q=${encodeURIComponent(d.site.address)}`} target="_blank" rel="noreferrer">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {d.site.address}
          </a>
          <div className="mt-1 text-xs text-muted-foreground">
            Dispatched {d.dispatchedAt ? fmtTime(d.dispatchedAt) : ""}{d.etaMins ? ` · target ${d.etaMins} min` : ""}
          </div>
          {d.status === "DISPATCHED" && <Button className="mt-3 h-12 w-full text-base" disabled={busy} onClick={() => respond(d.id, "en-route")}>Acknowledge — I&apos;m on my way</Button>}
          {d.status === "EN_ROUTE" && <Button className="mt-3 h-12 w-full text-base" disabled={busy} onClick={() => respond(d.id, "on-scene")}>I&apos;m on scene</Button>}
          {d.status === "ON_SCENE" && <p className="mt-3 rounded-md bg-background/40 p-2.5 text-sm">You&apos;re marked on scene. Report what you find to the control room, then file an incident report below.</p>}
        </section>
      ))}

      <section>
        <div className="eyebrow mb-2">Patrol runs</div>
        {data.patrols.length === 0 && <p className="rounded-[10px] border border-dashed p-4 text-center text-sm text-muted-foreground">No patrol run assigned to you today.</p>}
        <ul className="space-y-2">
          {data.patrols.map((p) => (
            <li key={p.id}>
              <Link href={`/m/work/patrol/${p.id}`} className="flex items-center gap-3 rounded-[10px] border bg-card p-3.5">
                <span className="flex-1">
                  <span className="block font-semibold"><span className="font-mono">{p.code}</span> {p.name}</span>
                  <span className="num block text-xs text-muted-foreground">{auDate(p.date)} · {p.done}/{p.stopCount} stops</span>
                </span>
                <StatusPill status={p.status} />
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Button asChild variant="outline" className="h-12 w-full text-base">
        <Link href="/m/work/incident"><FilePlus2 className="h-4 w-4" /> Report an incident</Link>
      </Button>

      <section>
        <div className="eyebrow mb-2">Training</div>
        {data.training.length === 0 && <p className="rounded-[10px] border border-dashed p-4 text-center text-sm text-muted-foreground">No training assigned.</p>}
        <ul className="space-y-2">
          {[...openTraining, ...passed].map((t) => (
            <li key={t.id}>
              <Link href={`/m/work/training/${t.id}`} className="flex items-center gap-3 rounded-[10px] border bg-card p-3.5">
                <span className="flex-1">
                  <span className="block font-medium leading-snug">{t.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.status === "PASSED"
                      ? `Passed ${t.score ?? ""}%${t.expiresAt ? ` · renew by ${auDate(t.expiresAt)}` : ""}`
                      : `${t.mandatory ? "Mandatory" : "Optional"}${t.dueAt ? ` · due ${auDate(t.dueAt)}` : ""}${t.status === "FAILED" ? ` · last attempt ${t.score}%` : ""}`}
                  </span>
                </span>
                <StatusPill status={t.status === "ASSIGNED" ? "PENDING" : t.status} />
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
