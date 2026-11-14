"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { api } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/ops";
import { Panel, Pill } from "@/components/ops/kit";

interface Resp {
  plan: Plan; plans: Plan[];
  usage: { guards: number; sites: number; subcontractors: number };
  sms: { month: string; outbound: number; inbound: number; failed: number; segments: number }[];
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const ratio = limit ? Math.min(1, used / limit) : 0;
  const over = limit !== null && used > limit;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className={cn("num", over && "text-red-700")}>{used} <span className="text-muted-foreground">/ {limit ?? "unlimited"}</span></span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${label}: ${used} of ${limit ?? "unlimited"}`}>
        <div className={cn("h-full rounded-full", over ? "bg-destructive" : ratio > 0.85 ? "bg-warning" : "bg-primary")} style={{ width: limit ? `${ratio * 100}%` : "4%" }} />
      </div>
      {over && <p className="mt-1 text-xs text-red-700">Over the plan allowance. Talk to Vigilo about moving up a tier.</p>}
    </div>
  );
}

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

export default function BillingPage() {
  const { data, isLoading } = useQuery<Resp>({ queryKey: ["billing"], queryFn: () => api(`/api/billing`) });
  return (
    <>
      <PageHeader title="Billing & Subscription" description="Your Vigilo plan and what you're using against it." />
      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {data && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <Panel title="Current plan">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl font-bold">{data.plan.name}</span>
                <span className="text-sm text-muted-foreground">{data.plan.price}</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Plan changes and payment are arranged with Vigilo directly; there is no card on file in this console. Contact your account manager to change tier.
              </p>
            </Panel>
            <Panel title="Usage">
              <div className="space-y-4">
                <Meter label="Active guards" used={data.usage.guards} limit={data.plan.guards} />
                <Meter label="Active sites" used={data.usage.sites} limit={data.plan.sites} />
                <Meter label="Subcontractor links" used={data.usage.subcontractors} limit={data.plan.subcontractors} />
              </div>
            </Panel>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {data.plans.map((p) => (
              <div key={p.key} className={cn("rounded-[10px] border bg-card p-4", p.key === data.plan.key && "border-primary")}>
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-bold">{p.name}</span>
                  {p.key === data.plan.key && <Pill tone="blue">Your plan</Pill>}
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">{p.price}</div>
                <div className="num mt-3 text-xs text-muted-foreground">
                  {p.guards ?? "Unlimited"} guards · {p.sites ?? "unlimited"} sites · {p.subcontractors ?? "unlimited"} subcontractors
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {p.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> {f}</li>)}
                </ul>
              </div>
            ))}
          </div>

          <Panel title="SMS usage — last six months">
            {data.sms.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No SMS sent yet.</p> : (
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="py-1.5">Month</th><th className="py-1.5 text-right">Sent</th><th className="py-1.5 text-right">Segments</th><th className="py-1.5 text-right">Failed</th><th className="py-1.5 text-right">Replies received</th></tr></thead>
                <tbody>
                  {data.sms.map((m) => (
                    <tr key={m.month} className="border-t"><td className="py-2">{monthLabel(m.month)}</td><td className="num py-2 text-right">{m.outbound}</td><td className="num py-2 text-right">{m.segments}</td><td className={cn("num py-2 text-right", m.failed > 0 && "text-red-700")}>{m.failed}</td><td className="num py-2 text-right">{m.inbound}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Segments estimate what your SMS provider bills: one per 153 characters. Counts cover messages to and from guards; carrier charges are on your Twilio account.</p>
          </Panel>
        </div>
      )}
    </>
  );
}
