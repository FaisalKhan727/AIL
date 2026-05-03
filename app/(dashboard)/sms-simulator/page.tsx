"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";

interface Guard { id: string; firstName: string; lastName: string; phone: string; }
interface SimShift { id: string; index: number; confirmCode: string; status: string; startAt: string; endAt: string; siteName: string; role: string | null; }
interface SimResponse {
  roster: { id: string; name: string } | null;
  shifts: SimShift[];
}

export default function SimulatorPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [guardId, setGuardId] = React.useState("");
  const [body, setBody] = React.useState("");
  const [result, setResult] = React.useState<{ ok: boolean; parsed?: boolean; reason?: string; applied?: number; summary?: { confirmedCount: number; rejectedCount: number; pendingCount: number }; autoReply?: string; note?: string } | null>(null);

  const { data: guards = [] } = useQuery<Guard[]>({
    queryKey: ["guards", "active"],
    queryFn: () => api(`/api/guards?active=true`),
  });
  const { data: sim } = useQuery<SimResponse>({
    queryKey: ["sim", guardId],
    queryFn: () => api(`/api/sms-simulator?guardId=${guardId}`),
    enabled: Boolean(guardId),
  });

  const guard = guards.find((g) => g.id === guardId);

  async function send() {
    if (!guard) return;
    try {
      const formBody = new URLSearchParams({ From: guard.phone, To: "+61400000000", Body: body, MessageSid: `SIM-${Date.now()}` });
      const res = await fetch("/api/sms/webhook", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formBody.toString(),
      });
      const data = await res.json();
      setResult(data);
      qc.invalidateQueries({ queryKey: ["sim", guardId] });
      qc.invalidateQueries({ queryKey: ["sms-log"] });
      qc.invalidateQueries({ queryKey: ["roster"] });
      toast({ title: data.parsed ? "Reply parsed" : data.note ? data.note : "Unparsed reply", variant: data.parsed ? "success" : "default" });
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  function quickFill(text: string) {
    setBody(text);
  }

  return (
    <>
      <PageHeader title="SMS Simulator" description="Simulate inbound SMS replies — exactly like the live Twilio webhook will run." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Compose reply</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="label">Guard</label>
              <Select value={guardId} onChange={(e) => { setGuardId(e.target.value); setResult(null); }}>
                <option value="">Select a guard…</option>
                {guards.map((g) => <option key={g.id} value={g.id}>{g.firstName} {g.lastName} — {g.phone}</option>)}
              </Select>
            </div>

            {sim?.roster ? (
              <div className="text-sm rounded border bg-muted/30 p-3">
                <div className="font-medium mb-1">{sim.roster.name}</div>
                <ol className="space-y-1">
                  {sim.shifts.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono">{s.index})</span>
                      <span>{fmtDateTime(s.startAt)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{s.siteName}</span>
                      <Badge className="bg-slate-100 text-slate-800 border-slate-300 font-mono">{s.confirmCode}</Badge>
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300">{s.status}</Badge>
                    </li>
                  ))}
                </ol>
              </div>
            ) : guardId ? (
              <p className="text-sm text-muted-foreground">No published roster for this guard. Publish one first.</p>
            ) : null}

            <div className="space-y-1">
              <label className="label">Reply body</label>
              <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. 1 YES, 2 NO, 3 YES" />
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Button size="sm" variant="outline" type="button" onClick={() => quickFill("ALL YES")}>ALL YES</Button>
              <Button size="sm" variant="outline" type="button" onClick={() => quickFill("ALL NO")}>ALL NO</Button>
              <Button size="sm" variant="outline" type="button" onClick={() => quickFill("1 YES")}>1 YES</Button>
              <Button size="sm" variant="outline" type="button" onClick={() => quickFill("1 NO")}>1 NO</Button>
              <Button size="sm" variant="outline" type="button" onClick={() => quickFill("1 YES, 2 NO, 3 YES")}>1 YES, 2 NO, 3 YES</Button>
              {sim?.shifts[0] && (
                <Button size="sm" variant="outline" type="button" onClick={() => quickFill(`YES ${sim.shifts[0].confirmCode}`)}>YES {sim.shifts[0].confirmCode}</Button>
              )}
            </div>

            <Button onClick={send} disabled={!guard || !body.trim()}>Submit to webhook</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Webhook response</CardTitle></CardHeader>
          <CardContent>
            {!result ? (
              <p className="text-sm text-muted-foreground">Submit a reply to see how it was parsed and what auto-reply was sent.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div>
                  Status:{" "}
                  {result.parsed ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Parsed</Badge> :
                    result.note ? <Badge className="bg-slate-100 text-slate-800 border-slate-300">{result.note}</Badge> :
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300">Unparsed: {result.reason}</Badge>}
                </div>
                {result.applied !== undefined && <div>Decisions applied: <strong>{result.applied}</strong></div>}
                {result.summary && (
                  <div>Confirmed: {result.summary.confirmedCount} · Rejected: {result.summary.rejectedCount} · Pending: {result.summary.pendingCount}</div>
                )}
                {result.autoReply && (
                  <div className="rounded border bg-muted/40 p-3 whitespace-pre-wrap text-xs"><strong className="block mb-1">Auto-reply (mock):</strong>{result.autoReply}</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
