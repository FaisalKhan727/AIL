"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer, Send, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { money, refLabel } from "@/lib/ops";
import { Panel, Pill, StatusPill, auDate, useAct } from "@/components/ops/kit";

interface Invoice {
  id: string; number: number; status: string; displayStatus: string; periodStart: string; periodEnd: string; issuedAt: string | null; dueAt: string | null; paidAt: string | null;
  gstRate: number; notes: string | null; subtotal: number; gst: number; total: number; companyName: string;
  client: { name: string; abn: string | null; contactName: string | null; contactPhone: string | null; billingEmail: string | null; paymentTermsDays: number };
  lines: { id: string; description: string; quantity: number; unitPrice: number; amount: number }[];
  payments: { id: string; amount: number; paidOn: string; method: string; reference: string | null; source: string }[];
  amountPaid: number; balance: number; externalId: string | null; externalProvider: string | null; syncedAt: string | null;
}
const METHOD: Record<string, string> = { BANK_TRANSFER: "Bank transfer", CARD: "Card", CHEQUE: "Cheque", CASH: "Cash", OTHER: "Other" };

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const act = useAct();
  const { data: inv, isLoading } = useQuery<Invoice>({ queryKey: ["invoice", id], queryFn: () => api(`/api/invoices/${id}`) });
  const [sms, setSms] = React.useState(false);
  const { data: integ } = useQuery<{ xero: { connected: boolean } }>({ queryKey: ["integrations"], queryFn: () => api(`/api/integrations`) });
  const [pay, setPay] = React.useState({ amount: "", paidOn: new Date().toISOString().slice(0, 10), method: "BANK_TRANSFER", reference: "" });
  const reload = () => Promise.all([qc.invalidateQueries({ queryKey: ["invoice", id] }), qc.invalidateQueries({ queryKey: ["invoices"] })]);
  const recordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    return act(async () => {
      await api(`/api/invoices/${id}/payments`, { method: "POST", body: JSON.stringify({ ...pay, amount: Number(pay.amount), reference: pay.reference || undefined }) });
      setPay((p) => ({ ...p, amount: "", reference: "" }));
      await reload();
    }, "Payment recorded");
  };

  const run = (action: string, ok: string, extra: Record<string, unknown> = {}) =>
    act(async () => {
      const r = await api<{ smsSent?: boolean }>(`/api/invoices/${id}`, { method: "POST", body: JSON.stringify({ action, ...extra }) });
      await Promise.all([qc.invalidateQueries({ queryKey: ["invoice", id] }), qc.invalidateQueries({ queryKey: ["invoices"] })]);
      if (extra.sms && r.smsSent === false) throw new Error("Invoice marked sent, but the SMS to the client failed.");
    }, ok);

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!inv) return <p className="text-muted-foreground">Invoice not found.</p>;
  const label = refLabel("INV", inv.number);

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link href="/invoicing"><ArrowLeft className="h-4 w-4" /> Invoices</Link></Button>
        <StatusPill status={inv.displayStatus} />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {inv.status === "DRAFT" && (
            <>
              {inv.client.contactPhone && <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> Text the client</label>}
              <Button onClick={() => run("send", `${label} marked as sent`, { sms })}>Mark as sent</Button>
            </>
          )}
          {inv.status === "SENT" && (
            <>
              {inv.client.contactPhone && <Button variant="outline" onClick={() => run("remind", "Reminder sent")}>Send SMS reminder</Button>}
              <Button onClick={() => run("paid", `${label} marked paid`)}>Paid in full</Button>
            </>
          )}
          {(inv.status === "SENT" || inv.status === "PAID") && !inv.externalId && (
            <Button variant="outline" disabled={!integ?.xero.connected} title={integ?.xero.connected ? undefined : "Connect Xero in Integrations"}
              onClick={() => act(async () => {
                const r = await api<{ results: { ok: boolean; message: string }[] }>(`/api/integrations/xero`, { method: "POST", body: JSON.stringify({ action: "invoices", ids: [id] }) });
                await reload();
                if (!r.results[0]?.ok) throw new Error(r.results[0]?.message || "Xero didn't accept the invoice");
              }, `${label} sent to Xero`)}>
              <Send className="h-4 w-4" /> Send to Xero
            </Button>
          )}
          {inv.externalId && <Pill tone="blue">In {inv.externalProvider === "XERO" ? "Xero" : inv.externalProvider}</Pill>}
          {(inv.status === "DRAFT" || inv.status === "SENT") && (
            <Button variant="outline" className="text-red-700" onClick={() => { if (confirm(`Void ${label}? Its timesheets and patrol runs become billable again.`)) run("void", `${label} voided`); }}>Void</Button>
          )}
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / PDF</Button>
        </span>
      </div>

      <div className="print-sheet mx-auto max-w-3xl rounded-md p-10 text-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-2xl font-bold">{inv.companyName}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-neutral-500">Tax invoice</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xl font-bold">{label}</div>
            {inv.status === "DRAFT" && <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Draft — not issued</div>}
            {inv.status === "VOID" && <div className="text-xs font-semibold uppercase tracking-wider text-red-600">Void</div>}
            {inv.status === "PAID" && <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Paid {auDate(inv.paidAt)}</div>}
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-6 text-[13px]">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-neutral-500">Bill to</div>
            <div className="mt-1 font-semibold">{inv.client.name}</div>
            {inv.client.abn && <div>ABN {inv.client.abn}</div>}
            {inv.client.contactName && <div>Attn: {inv.client.contactName}</div>}
            {inv.client.billingEmail && <div>{inv.client.billingEmail}</div>}
          </div>
          <dl className="space-y-0.5 text-right">
            <div><dt className="inline text-neutral-500">Period: </dt><dd className="inline">{auDate(inv.periodStart)} – {auDate(inv.periodEnd)}</dd></div>
            <div><dt className="inline text-neutral-500">Issued: </dt><dd className="inline">{auDate(inv.issuedAt)}</dd></div>
            <div><dt className="inline text-neutral-500">Due: </dt><dd className="inline">{inv.dueAt ? auDate(inv.dueAt) : `${inv.client.paymentTermsDays} days from issue`}</dd></div>
          </dl>
        </div>
        <table className="mt-8 w-full border-collapse text-[13px]">
          <thead><tr className="border-b-2 border-black text-left text-[11px] uppercase tracking-wider"><th className="py-2">Description</th><th className="w-14 py-2 text-right">Qty</th><th className="w-24 py-2 text-right">Unit</th><th className="w-28 py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="border-b border-neutral-300"><td className="py-2">{l.description}</td><td className="py-2 text-right tabular-nums">{l.quantity}</td><td className="py-2 text-right tabular-nums">{money(l.unitPrice)}</td><td className="py-2 text-right tabular-nums">{money(l.amount)}</td></tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-4 w-64 space-y-1 text-[13px]">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{money(inv.subtotal)}</dd></div>
          <div className="flex justify-between"><dt>GST {inv.gstRate}%</dt><dd className="tabular-nums">{money(inv.gst)}</dd></div>
          <div className="flex justify-between border-t-2 border-black pt-1.5 text-base font-bold"><dt>Total AUD</dt><dd className="tabular-nums">{money(inv.total)}</dd></div>
        </dl>
        {inv.amountPaid > 0 && (
          <dl className="ml-auto mt-2 w-64 space-y-1 text-[13px]">
            <div className="flex justify-between"><dt>Paid</dt><dd className="tabular-nums">−{money(inv.amountPaid)}</dd></div>
            <div className="flex justify-between font-bold"><dt>Amount owing</dt><dd className="tabular-nums">{money(inv.balance)}</dd></div>
          </dl>
        )}
        {inv.notes && <p className="mt-8 border-t border-neutral-300 pt-3 text-[13px] text-neutral-700">{inv.notes}</p>}
      </div>

      {(inv.status === "SENT" || inv.payments.length > 0) && (
        <Panel title={`Payments · ${money(inv.amountPaid)} received, ${money(inv.balance)} owing`} className="no-print mx-auto mt-4 max-w-3xl">
          {inv.payments.length > 0 && (
            <table className="mb-4 w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="py-1">Date</th><th className="py-1">Method</th><th className="py-1">Reference</th><th className="py-1 text-right">Amount</th><th /></tr></thead>
              <tbody>
                {inv.payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="num py-1.5">{auDate(p.paidOn)}</td>
                    <td className="py-1.5">{METHOD[p.method] ?? p.method}{p.source === "XERO" && <Pill tone="blue" className="ml-2">From Xero</Pill>}</td>
                    <td className="py-1.5 text-muted-foreground">{p.reference ?? "—"}</td>
                    <td className="num py-1.5 text-right">{money(p.amount)}</td>
                    <td className="py-1.5 text-right">{p.source === "MANUAL" && (
                      <Button size="sm" variant="ghost" className="px-2 text-red-700" aria-label="Remove payment" onClick={() => act(async () => { await api(`/api/invoices/${id}/payments?paymentId=${p.id}`, { method: "DELETE" }); await reload(); }, "Payment removed")}><Trash2 className="h-3.5 w-3.5" /></Button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {inv.status === "SENT" && inv.externalId && (
            <p className="text-sm text-muted-foreground">This invoice is in Xero. Record payments there; they come across when you press “Bring payments across” in Integrations.</p>
          )}
          {inv.status === "SENT" && !inv.externalId && (
            <form onSubmit={recordPayment} className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_10rem_10rem_1fr_auto] sm:items-end">
              <div className="space-y-1"><Label htmlFor="p-amt">Amount</Label><Input id="p-amt" type="number" step="0.01" min="0.01" max={inv.balance} required value={pay.amount} placeholder={inv.balance.toFixed(2)} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="p-date">Received</Label><Input id="p-date" type="date" required value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="p-m">Method</Label><Select id="p-m" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
              <div className="space-y-1"><Label htmlFor="p-ref">Reference</Label><Input id="p-ref" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="Bank reference" /></div>
              <Button type="submit">Record payment</Button>
            </form>
          )}
        </Panel>
      )}
    </>
  );
}
