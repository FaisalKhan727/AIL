"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/fetcher";
import { fmtTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { StatusPill, useAct } from "@/components/ops/kit";

interface Stop { id: string; name: string; address: string | null; instructions: string | null; status: string; at: string | null; note: string | null }
interface Job { id: string; code: string; name: string; status: string; startedAt: string | null; vehicle: { code: string; rego: string } | null; checkItems: string[]; stops: Stop[] }

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const t = setTimeout(() => resolve(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: 5500, maximumAge: 30_000 },
    );
  });
}

export default function GuardPatrol() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const act = useAct();
  const { data: job, isLoading } = useQuery<Job>({ queryKey: ["m-patrol", id], queryFn: () => api(`/api/m/patrol/${id}`) });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [failed, setFailed] = React.useState<Set<string>>(new Set());
  const [odo, setOdo] = React.useState("");
  const [fuel, setFuel] = React.useState("Full");
  const [checkNotes, setCheckNotes] = React.useState("");

  const post = async (body: Record<string, unknown>, ok?: string) => {
    const done = await act(async () => {
      const fresh = await api<Job>(`/api/m/patrol/${id}`, { method: "POST", body: JSON.stringify(body) });
      qc.setQueryData(["m-patrol", id], fresh);
      qc.invalidateQueries({ queryKey: ["m-work"] });
    }, ok);
    setBusy(null);
    return done;
  };

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!job) return <p className="text-muted-foreground">Patrol not found.</p>;
  const done = job.stops.filter((s) => s.status !== "PENDING").length;
  const next = job.stops.find((s) => s.status === "PENDING");

  return (
    <div className="space-y-4">
      <Link href="/m/work" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Tasks</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold"><span className="font-mono">{job.code}</span> {job.name}</h1>
          <p className="text-sm text-muted-foreground">{job.vehicle ? `${job.vehicle.code} · ${job.vehicle.rego}` : "No vehicle"}{job.startedAt ? ` · started ${fmtTime(job.startedAt)}` : ""}</p>
        </div>
        <StatusPill status={job.status} />
      </div>

      {job.status === "SCHEDULED" && (
        <section className="space-y-3 rounded-[10px] border bg-card p-4">
          {job.vehicle ? (
            <>
              <div className="eyebrow">Vehicle check — untick anything that fails</div>
              <ul className="space-y-1.5">
                {job.checkItems.map((item) => (
                  <li key={item}>
                    <label className="flex items-center gap-2.5 text-sm">
                      <input type="checkbox" className="h-4 w-4" checked={!failed.has(item)} onChange={(e) => setFailed((f) => { const n = new Set(f); if (e.target.checked) n.delete(item); else n.add(item); return n; })} />
                      <span className={failed.has(item) ? "text-red-700" : ""}>{item}{failed.has(item) ? " — FAIL" : ""}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label htmlFor="odo">Odometer (km)</Label><Input id="odo" inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value.replace(/\D/g, ""))} /></div>
                <div className="space-y-1"><Label htmlFor="fuel">Fuel</Label><Select id="fuel" value={fuel} onChange={(e) => setFuel(e.target.value)}>{["Full", "3/4", "1/2", "1/4", "Low"].map((f) => <option key={f}>{f}</option>)}</Select></div>
              </div>
              <Input placeholder={failed.size ? "Describe the fault" : "Notes (optional)"} value={checkNotes} onChange={(e) => setCheckNotes(e.target.value)} />
            </>
          ) : <p className="text-sm text-muted-foreground">{job.stops.length} stops on this run.</p>}
          <Button
            className="h-12 w-full text-base"
            disabled={busy === "start" || (failed.size > 0 && !checkNotes.trim())}
            onClick={() => { setBusy("start"); post({ action: "start", ...(job.vehicle ? { check: { odometer: odo || undefined, fuel, failed: Array.from(failed), notes: checkNotes || undefined } } : {}) }, "Patrol started"); }}
          >
            {busy === "start" ? "Starting…" : "Start patrol"}
          </Button>
        </section>
      )}

      {job.status !== "SCHEDULED" && (
        <>
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Progress</span><span className="num">{done}/{job.stops.length}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${(done / Math.max(1, job.stops.length)) * 100}%` }} /></div>
          </div>
          <ol className="space-y-2">
            {job.stops.map((s, i) => {
              const isNext = job.status === "ACTIVE" && s.id === next?.id;
              return (
                <li key={s.id} className={cn("rounded-[10px] border bg-card p-3.5", isNext && "border-primary", s.status === "MISSED" && "border-destructive/50")}>
                  <div className="flex items-start gap-3">
                    <span className={cn("num grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs", s.status === "SCANNED" ? "bg-success/20 text-success" : s.status === "MISSED" ? "bg-destructive/20 text-red-700" : "bg-muted text-muted-foreground")}>
                      {s.status === "SCANNED" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-snug">{s.name}</div>
                      {s.address && (
                        <a className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground" href={`https://maps.google.com/?q=${encodeURIComponent(s.address)}`} target="_blank" rel="noreferrer">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {s.address}
                        </a>
                      )}
                      {s.instructions && s.status === "PENDING" && <p className="mt-1.5 rounded bg-muted/50 p-2 text-xs">{s.instructions}</p>}
                      {s.at && <div className="num mt-1 text-xs text-muted-foreground">{s.status === "SCANNED" ? "Attended" : "Missed"} {fmtTime(s.at)}{s.note ? ` · ${s.note}` : ""}</div>}
                    </div>
                  </div>
                  {job.status === "ACTIVE" && s.status === "PENDING" && missing !== s.id && (
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                      <Button disabled={busy === s.id} onClick={async () => { setBusy(s.id); const pos = await getPosition(); post({ action: "scan", stopId: s.id, ...(pos ?? {}) }); }}>
                        {busy === s.id ? "Recording…" : "Attended — check in"}
                      </Button>
                      <Button variant="outline" onClick={() => { setMissing(s.id); setReason(""); }}>Can&apos;t attend</Button>
                    </div>
                  )}
                  {missing === s.id && (
                    <div className="mt-3 space-y-2">
                      <Input autoFocus placeholder="Why? (locked gate, road closed…)" value={reason} onChange={(e) => setReason(e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={() => setMissing(null)}>Back</Button>
                        <Button variant="destructive" disabled={reason.trim().length < 3} onClick={async () => { if (await post({ action: "miss", stopId: s.id, note: reason })) setMissing(null); }}>Mark missed</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {job.status === "ACTIVE" && (
            <Button className="h-12 w-full text-base" variant={next ? "outline" : "default"} disabled={busy === "complete"} onClick={() => { setBusy("complete"); post({ action: "complete" }, "Patrol completed"); }}>
              {next ? `Finish run (${job.stops.length - done} stops still open)` : "Finish run"}
            </Button>
          )}
          {job.status !== "ACTIVE" && <p className="rounded-[10px] border border-dashed p-4 text-center text-sm text-muted-foreground">This run is closed. Thanks.</p>}
        </>
      )}
    </div>
  );
}
