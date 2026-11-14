"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/fetcher";
import { invoiceTotals, money, refLabel } from "@/lib/ops";
import { DataTable, Stat, StatusPill, auDate, useAct, type Col } from "@/components/ops/kit";

interface Invoice {
  id: string; number: number; client: { name: string }; periodStart: string; periodEnd: string; status: string; displayStatus: string;
  issuedAt: string | null; dueAt: string | null; total: number; lines: unknown[];
}
interface Billable { id: string; date: string; code: string; name: string; status: string; scanned: number; stopCount: number; rate: number; amount: number }
interface Extra { description: string; quantity: string; unitPrice: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function InvoicingPage() {
  const qc = useQueryClient();
  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({ queryKey: ["invoices"], queryFn: () => api(`/api/invoices`) });
  const [open, setOpen] = React.useState(false);

  const sum = (f: (i: Invoice) => boolean) => invoices.filter(f).reduce((n, i) => n + i.total, 0);
  const month = iso(new Date()).slice(0, 7);
  const cols: Col<Invoice>[] = [
    { h: "Invoice", c: (i) => <Link href={`/invoicing/${i.id}`} className="font-mono font-medium hover:underline">{refLabel("INV", i.number)}</Link> },
    { h: "Client", c: (i) => i.client.name },
    { h: "Period", c: (i) => <span className="num whitespace-nowrap text-xs">{auDate(i.periodStart)} → {auDate(i.periodEnd)}</span> },
    { h: "Issued", c: (i) => <span className="num text-xs">{auDate(i.issuedAt)}</span> },
    { h: "Due", c: (i) => <span className={`num text-xs ${i.displayStatus === "OVERDUE" ? "text-red-300" : ""}`}>{auDate(i.dueAt)}</span> },
    { h: "Lines", c: (i) => <span className="num">{i.lines.length}</span> },
    { h: "Total (inc. GST)", c: (i) => <span className="num">{money(i.total)}</span>, className: "text-right" },
    { h: "Status", c: (i) => <StatusPill status={i.displayStatus} /> },
  ];

  return (
    <>
      <PageHeader title="Patrol Invoicing" description="Bill clients for completed patrol runs." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New invoice</Button>} />
      <p className="mb-4 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
        Invoices are built from patrol jobs (completed runs × contracted rate, pro-rata for partial runs). Guard timesheets are not part of this.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invoiced this month" value={money(sum((i) => i.status !== "DRAFT" && i.status !== "VOID" && (i.issuedAt ?? "").startsWith(month)))} />
        <Stat label="Outstanding" value={money(sum((i) => i.status === "SENT"))} />
        <Stat label="Overdue" value={money(sum((i) => i.displayStatus === "OVERDUE"))} tone={sum((i) => i.displayStatus === "OVERDUE") > 0 ? "text-critical" : undefined} />
        <Stat label="Collected" value={money(sum((i) => i.status === "PAID"))} tone="text-success" />
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : <DataTable cols={cols} rows={invoices} empty="No invoices yet." />}
      <Builder open={open} onOpenChange={setOpen} onDone={() => { qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["patrol-jobs"] }); }} />
    </>
  );
}

function Builder({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const act = useAct();
  const { data: clients = [] } = useQuery<{ id: string; name: string; active: boolean; paymentTermsDays: number }[]>({ queryKey: ["clients"], queryFn: () => api(`/api/clients`), enabled: open });
  const [clientId, setClientId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [skip, setSkip] = React.useState<Set<string>>(new Set());
  const [extras, setExtras] = React.useState<Extra[]>([]);
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const now = new Date();
    setClientId(""); setSkip(new Set()); setExtras([]); setNotes(""); setSaving(false);
    setFrom(iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)))); setTo(iso(now));
  }, [open]);

  const ready = Boolean(clientId && from && to);
  const { data: jobs = [], isFetching } = useQuery<Billable[]>({
    queryKey: ["billable", clientId, from, to],
    queryFn: () => api(`/api/invoices/billable?clientId=${clientId}&from=${from}&to=${to}`),
    enabled: open && ready,
  });
  const chosen = jobs.filter((j) => !skip.has(j.id));
  const validExtras = extras.filter((e) => e.description.trim() && Number(e.quantity) > 0 && e.unitPrice !== "" && Number.isFinite(Number(e.unitPrice)));
  const totals = invoiceTotals(
    [...chosen.map((j) => ({ quantity: 1, unitPrice: j.amount })), ...validExtras.map((e) => ({ quantity: Number(e.quantity), unitPrice: Number(e.unitPrice) }))],
    10,
  );
  const setExtra = (i: number, k: keyof Extra, v: string) => setExtras((x) => x.map((e, j) => (j === i ? { ...e, [k]: v } : e)));

  async function create() {
    setSaving(true);
    const ok = await act(async () => {
      await api(`/api/invoices`, {
        method: "POST",
        body: JSON.stringify({
          clientId, periodStart: from, periodEnd: to, jobIds: chosen.map((j) => j.id), notes,
          extraLines: validExtras.map((e) => ({ description: e.description, quantity: Number(e.quantity), unitPrice: Number(e.unitPrice) })),
        }),
      });
    }, "Draft invoice created");
    setSaving(false);
    if (ok) { onDone(); onOpenChange(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:!max-w-3xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>Pick a client and period. Finished patrol jobs that haven&apos;t been billed are pulled in automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_10rem]">
          <div className="space-y-1"><Label htmlFor="inv-client">Client</Label>
            <Select id="inv-client" value={clientId} onChange={(e) => { setClientId(e.target.value); setSkip(new Set()); }}>
              <option value="">Select client…</option>
              {clients.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="inv-from">From</Label><Input id="inv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="inv-to">To</Label><Input id="inv-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>

        {ready && (
          <div className="space-y-3">
            <div className="max-h-56 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-popover text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr><th className="w-8 px-3 py-2" /><th className="px-2 py-2">Date</th><th className="px-2 py-2">Run</th><th className="px-2 py-2">Stops</th><th className="px-2 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {jobs.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">{isFetching ? "Looking for billable jobs…" : "No unbilled patrol jobs for this client in this period."}</td></tr>}
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t">
                      <td className="px-3 py-1.5"><input type="checkbox" aria-label={`Include ${j.code} ${j.date}`} checked={!skip.has(j.id)} onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(j.id); else n.add(j.id); return n; })} /></td>
                      <td className="num px-2 py-1.5 text-xs">{auDate(j.date)}</td>
                      <td className="px-2 py-1.5"><span className="font-mono">{j.code}</span> <span className="text-muted-foreground">{j.name}</span></td>
                      <td className="num px-2 py-1.5 text-xs">{j.scanned}/{j.stopCount}{j.status === "PARTIAL" && <span className="ml-1.5 text-amber-300">partial</span>}</td>
                      <td className="num px-2 py-1.5 text-right text-xs text-muted-foreground">{money(j.rate)}</td>
                      <td className="num px-3 py-1.5 text-right">{money(j.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <div className="eyebrow">Additional charges or credits</div>
              {extras.map((e, i) => (
                <div key={i} className="grid grid-cols-[1fr_4.5rem_7rem_auto] gap-2">
                  <Input placeholder="Call-out fee, fuel levy, SLA credit…" value={e.description} onChange={(ev) => setExtra(i, "description", ev.target.value)} />
                  <Input type="number" min="0" step="0.01" aria-label="Quantity" value={e.quantity} onChange={(ev) => setExtra(i, "quantity", ev.target.value)} />
                  <Input type="number" step="0.01" placeholder="Unit $" aria-label="Unit price (negative for a credit)" value={e.unitPrice} onChange={(ev) => setExtra(i, "unitPrice", ev.target.value)} />
                  <Button type="button" variant="ghost" className="px-2 text-red-300" aria-label="Remove line" onClick={() => setExtras((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setExtras((x) => [...x, { description: "", quantity: "1", unitPrice: "" }])}><Plus className="h-3.5 w-3.5" /> Add line</Button>
            </div>
            <Input placeholder="Note to appear on the invoice (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

            <dl className="ml-auto w-full max-w-xs space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="num">{money(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">GST 10%</dt><dd className="num">{money(totals.gst)}</dd></div>
              <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="num">{money(totals.total)}</dd></div>
            </dl>
          </div>
        )}
        <DialogFooter className="dialog-footer-sticky">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!ready || saving || (chosen.length === 0 && validExtras.length === 0)} onClick={create}>{saving ? "Creating…" : "Save as draft"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
