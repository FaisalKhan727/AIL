"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { money, refLabel } from "@/lib/ops";
import { StatusPill, auDate, useAct } from "@/components/ops/kit";

interface Invoice {
  id: string; number: number; status: string; displayStatus: string; periodStart: string; periodEnd: string; issuedAt: string | null; dueAt: string | null; paidAt: string | null;
  gstRate: number; notes: string | null; subtotal: number; gst: number; total: number; companyName: string;
  client: { name: string; abn: string | null; contactName: string | null; contactPhone: string | null; billingEmail: string | null; paymentTermsDays: number };
  lines: { id: string; description: string; quantity: number; unitPrice: number; amount: number }[];
}

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const act = useAct();
  const { data: inv, isLoading } = useQuery<Invoice>({ queryKey: ["invoice", id], queryFn: () => api(`/api/invoices/${id}`) });
  const [sms, setSms] = React.useState(false);

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
              <Button onClick={() => run("paid", `${label} marked paid`)}>Mark paid</Button>
            </>
          )}
          {(inv.status === "DRAFT" || inv.status === "SENT") && (
            <Button variant="outline" className="text-red-700" onClick={() => { if (confirm(`Void ${label}? Its patrol jobs become billable again.`)) run("void", `${label} voided`); }}>Void</Button>
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
        {inv.notes && <p className="mt-8 border-t border-neutral-300 pt-3 text-[13px] text-neutral-700">{inv.notes}</p>}
      </div>
    </>
  );
}
