"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, Download, Lock, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/fetcher";
import { money } from "@/lib/ops";
import { cn } from "@/lib/utils";
import { Panel, Pill, Stat, useAct } from "@/components/ops/kit";

interface Person {
  guardId: string; name: string; employmentType: string; baseRate: number; payrollRef: string | null; externalEmployeeId: string | null;
  shifts: number; hours: number; gross: number; ote: number; super: number;
  breakdown: { category: string; label: string; hours: number; multiplier: number; amount: number }[];
  adjustments: { id: string; note: string | null; amount: number; superable: boolean }[];
}
interface Run {
  id: string; number: number; status: "DRAFT" | "FINALISED"; periodStart: string; periodEnd: string; payDate: string; superRate: number;
  createdBy: string; finalisedAt: string | null; finalisedBy: string | null; exportedAt: string | null; exportedTo: string | null;
  shiftCount: number; people: Person[]; totals: { hours: number; gross: number; super: number };
}

const dmy = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const EMP: Record<string, string> = { CASUAL: "Casual", PART_TIME: "Part-time", FULL_TIME: "Full-time" };

export default function PayRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const act = useAct();
  const { data: run, isLoading } = useQuery<Run>({ queryKey: ["pay-run", id], queryFn: () => api(`/api/pay-runs/${id}`) });
  const { data: integ } = useQuery<{ xero: { connected: boolean } }>({ queryKey: ["integrations"], queryFn: () => api(`/api/integrations`) });
  const [openRows, setOpenRows] = React.useState<Set<string>>(new Set());
  const [adjFor, setAdjFor] = React.useState<Person | null>(null);
  const [confirmFinal, setConfirmFinal] = React.useState(false);

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["pay-run", id] }); qc.invalidateQueries({ queryKey: ["pay-runs"] }); qc.invalidateQueries({ queryKey: ["timesheets"] }); };
  const post = (body: Record<string, unknown>, ok: string, desc?: string) =>
    act(async () => { await api(`/api/pay-runs/${id}`, { method: "POST", body: JSON.stringify(body) }); await refresh(); }, ok, desc);

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!run) return <p className="text-muted-foreground">Pay run not found.</p>;
  const draft = run.status === "DRAFT";
  const toggle = (g: string) => setOpenRows((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const sendXero = () => {
    if (run.exportedTo === "Xero Payroll" && !confirm("This pay run was already sent to Xero. Sending again creates a second set of draft timesheets there. Continue?")) return;
    return sendXeroNow();
  };
  const sendXeroNow = () => act(async () => {
    const r = await api<{ timesheets: number; adjustments: number }>(`/api/integrations/xero`, { method: "POST", body: JSON.stringify({ action: "payrun", payRunId: id }) });
    await refresh();
    return r;
  }, "Sent to Xero Payroll", "Draft timesheets created. Open Xero to process the pay run.");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link href="/payroll"><ArrowLeft className="h-4 w-4" /> Pay runs</Link></Button>
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Pay run #{run.number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dmy(run.periodStart)} – {dmy(run.periodEnd)} · paid {dmy(run.payDate)} · {run.shiftCount} timesheets ·{" "}
            {draft ? <>draft by {run.createdBy}</> : <>finalised by {run.finalisedBy}</>}
            {run.exportedTo && <> · sent to {run.exportedTo}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft ? (
            <>
              <Button variant="outline" className="text-red-700" onClick={async () => {
                if (!confirm(`Delete draft pay run #${run.number}? Its timesheets are released so they can be corrected.`)) return;
                if (await act(() => api(`/api/pay-runs/${id}`, { method: "DELETE" }), "Draft deleted")) { await refresh(); router.push("/payroll"); }
              }}><Trash2 className="h-4 w-4" /> Delete draft</Button>
              <Button variant="outline" onClick={() => post({ action: "recalculate" }, "Recalculated", "Using the current pay rules and guard rates.")}><RefreshCw className="h-4 w-4" /> Recalculate</Button>
              <Button onClick={() => setConfirmFinal(true)}><Lock className="h-4 w-4" /> Finalise</Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline"><a href={`/api/pay-runs/${id}/export?format=summary`} onClick={() => setTimeout(refresh, 800)}><Download className="h-4 w-4" /> Summary CSV</a></Button>
              <Button asChild variant="outline"><a href={`/api/pay-runs/${id}/export?format=employment-hero`} onClick={() => setTimeout(refresh, 800)}><Download className="h-4 w-4" /> Employment Hero</a></Button>
              <Button asChild variant="outline"><a href={`/api/pay-runs/${id}/export?format=myob`} onClick={() => setTimeout(refresh, 800)}><Download className="h-4 w-4" /> MYOB</a></Button>
              <Button onClick={sendXero} disabled={!integ?.xero.connected} title={integ?.xero.connected ? undefined : "Connect Xero in Integrations"}><Send className="h-4 w-4" /> Send to Xero Payroll</Button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Guards" value={run.people.length} />
        <Stat label="Hours" value={run.totals.hours.toFixed(2)} />
        <Stat label="Gross pay" value={money(run.totals.gross)} sub="Before tax" />
        <Stat label={`Super (${run.superRate}%)`} value={money(run.totals.super)} sub="On ordinary time earnings" />
      </div>

      <div className="overflow-x-auto rounded-[10px] border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-background/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b">
              <th className="w-8 px-3 py-2" /><th className="px-3 py-2">Guard</th><th className="px-3 py-2">Employment</th><th className="px-3 py-2 text-right">Base rate</th>
              <th className="px-3 py-2 text-right">Shifts</th><th className="px-3 py-2 text-right">Hours</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Super</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {run.people.map((p) => {
              const open = openRows.has(p.guardId);
              return (
                <React.Fragment key={p.guardId}>
                  <tr className="cursor-pointer border-b hover:bg-muted/50" onClick={() => toggle(p.guardId)}>
                    <td className="px-3 py-2.5 text-muted-foreground">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="px-3 py-2.5 font-medium">{p.name}{p.payrollRef && <span className="ml-2 font-mono text-xs text-muted-foreground">{p.payrollRef}</span>}</td>
                    <td className="px-3 py-2.5">{EMP[p.employmentType] ?? p.employmentType}</td>
                    <td className="num px-3 py-2.5 text-right">{money(p.baseRate)}</td>
                    <td className="num px-3 py-2.5 text-right">{p.shifts}</td>
                    <td className="num px-3 py-2.5 text-right">{p.hours.toFixed(2)}</td>
                    <td className="num px-3 py-2.5 text-right font-medium">{money(p.gross)}</td>
                    <td className="num px-3 py-2.5 text-right">{money(p.super)}</td>
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      {draft && <Button size="sm" variant="ghost" onClick={() => setAdjFor(p)}><Plus className="h-3.5 w-3.5" /> Adjustment</Button>}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b bg-background/50">
                      <td />
                      <td colSpan={8} className="px-3 py-3">
                        <table className="w-full max-w-2xl text-[13px]">
                          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="py-1">Pay category</th><th className="py-1 text-right">Hours</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">Amount</th><th className="w-10" /></tr></thead>
                          <tbody>
                            {p.breakdown.map((b, i) => {
                              const adj = b.category === "ADJUSTMENT" ? p.adjustments.find((a) => a.note === b.label && a.amount === b.amount) : null;
                              return (
                                <tr key={i} className="border-t">
                                  <td className="py-1.5">{b.label}{b.category === "ADJUSTMENT" && <Pill tone="blue" className="ml-2">{adj?.superable ? "Super applies" : "No super"}</Pill>}</td>
                                  <td className="num py-1.5 text-right">{b.category === "ADJUSTMENT" ? "—" : b.hours.toFixed(2)}</td>
                                  <td className="num py-1.5 text-right text-muted-foreground">{b.category === "ADJUSTMENT" ? "—" : `${money(p.baseRate * b.multiplier)} (${Math.round(b.multiplier * 1000) / 10}%)`}</td>
                                  <td className={cn("num py-1.5 text-right", b.amount < 0 && "text-red-700")}>{money(b.amount)}</td>
                                  <td className="text-right">{draft && adj && (
                                    <button className="text-xs text-red-700 hover:underline" onClick={() => post({ action: "remove-adjustment", lineId: adj.id }, "Adjustment removed")}>Remove</button>
                                  )}</td>
                                </tr>
                              );
                            })}
                            <tr className="border-t font-medium"><td className="py-1.5">Gross</td><td className="num py-1.5 text-right">{p.hours.toFixed(2)}</td><td /><td className="num py-1.5 text-right">{money(p.gross)}</td><td /></tr>
                            <tr className="text-muted-foreground"><td className="py-1">Super on {money(p.ote)} at {run.superRate}%</td><td /><td /><td className="num py-1 text-right">{money(p.super)}</td><td /></tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-medium"><td /><td className="px-3 py-2.5">Total</td><td /><td /><td /><td className="num px-3 py-2.5 text-right">{run.totals.hours.toFixed(2)}</td><td className="num px-3 py-2.5 text-right">{money(run.totals.gross)}</td><td className="num px-3 py-2.5 text-right">{money(run.totals.super)}</td><td /></tr>
          </tfoot>
        </table>
      </div>

      {!draft && (
        <Panel title="Next steps" className="mt-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Send the run to your payroll system: Xero Payroll (button above), or download the Employment Hero or MYOB file and import it.</li>
            <li>In that system, check the timesheets, process the pay run, and let it calculate tax and super.</li>
            <li>Lodge with Single Touch Payroll and pay the guards from there.</li>
          </ol>
        </Panel>
      )}

      <AdjustDialog person={adjFor} onClose={() => setAdjFor(null)} onSave={(body) => post({ action: "adjust", guardId: adjFor!.guardId, ...body }, "Adjustment added")} />
      <Dialog open={confirmFinal} onOpenChange={setConfirmFinal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalise pay run #{run.number}?</DialogTitle>
            <DialogDescription>
              {money(run.totals.gross)} gross for {run.people.length} guards. Its {run.shiftCount} timesheets stay locked and the run can no longer be changed or deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFinal(false)}>Cancel</Button>
            <Button onClick={async () => { if (await post({ action: "finalise" }, `Pay run #${run.number} finalised`)) setConfirmFinal(false); }}>Finalise</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AdjustDialog({ person, onClose, onSave }: { person: Person | null; onClose: () => void; onSave: (b: { note: string; amount: number; superable: boolean }) => Promise<boolean> }) {
  const [note, setNote] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [superable, setSuperable] = React.useState(false);
  React.useEffect(() => { setNote(""); setAmount(""); setSuperable(false); }, [person]);
  if (!person) return null;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await onSave({ note: note.trim(), amount: Number(amount), superable })) onClose(); }}>
          <DialogHeader>
            <DialogTitle>Add adjustment</DialogTitle>
            <DialogDescription>{person.name}. Use this for allowances, reimbursements or corrections. A negative amount is a deduction.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div className="space-y-1"><Label htmlFor="adj-n">Description</Label><Input id="adj-n" required minLength={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="First aid allowance" /></div>
            <div className="space-y-1"><Label htmlFor="adj-a">Amount ($)</Label><Input id="adj-a" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={superable} onChange={(e) => setSuperable(e.target.checked)} /> Counts toward super (ordinary time earnings)</label>
          <DialogFooter className="dialog-footer-sticky">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
