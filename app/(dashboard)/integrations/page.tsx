"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { CheckCircle2, ExternalLink, RefreshCw, Unplug, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";
import { CATEGORY_LABEL, type Category } from "@/lib/payroll";
import type { AccountingSettings } from "@/lib/exports";
import { DataTable, Panel, Pill, useAct } from "@/components/ops/kit";

interface Resp {
  xero: { configured: boolean; redirectUri: string; connected: boolean; tenantName: string | null; connectedAt: string | null; connectedBy: string | null };
  settings: AccountingSettings;
  guards: { id: string; name: string; linked: boolean; payrollRef: string | null }[];
  logs: { id: string; provider: string; kind: string; ok: boolean; message: string; at: string }[];
}
const PAY_CATS = (Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => c !== "ADJUSTMENT");
const PROVIDER: Record<string, string> = { XERO: "Xero", MYOB: "MYOB", QUICKBOOKS: "QuickBooks", EMPLOYMENT_HERO: "Employment Hero", FILE: "File" };

export default function IntegrationsPage() {
  return <Suspense fallback={null}><Integrations /></Suspense>;
}

function Integrations() {
  const qc = useQueryClient();
  const act = useAct();
  const sp = useSearchParams();
  const { data: session } = useSession();
  const owner = session?.user?.role === "OWNER";
  const { data, isLoading } = useQuery<Resp>({ queryKey: ["integrations"], queryFn: () => api(`/api/integrations`) });
  const [s, setS] = React.useState<AccountingSettings | null>(null);
  const [rates, setRates] = React.useState<{ id: string; name: string }[] | null>(null);
  React.useEffect(() => { if (data) setS(data.settings); }, [data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["integrations"] });
  const xero = (action: string, ok: string, extra: Record<string, unknown> = {}) =>
    act(async () => { const r = await api<Record<string, unknown>>(`/api/integrations/xero`, { method: "POST", body: JSON.stringify({ action, ...extra }) }); await refresh(); return r; }, ok);
  const save = () => act(async () => { setS(await api<AccountingSettings>(`/api/accounting/settings`, { method: "PUT", body: JSON.stringify(s) })); await refresh(); }, "Accounting settings saved");

  if (isLoading || !data || !s) return <p className="text-muted-foreground">Loading…</p>;
  const x = data.xero;
  const linked = data.guards.filter((g) => g.linked).length;

  return (
    <>
      <PageHeader title="Integrations" description="Connect your accounting and payroll software so invoices and pay runs don't have to be typed in twice." />
      {sp.get("connected") && <p className="mb-4 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-emerald-800">Connected to {sp.get("connected")} in Xero.</p>}
      {sp.get("error") && <p className="notice-danger mb-4 rounded-md border px-3 py-2 text-sm">{sp.get("error")}</p>}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Xero"
          action={x.connected ? <Pill tone="green">Connected</Pill> : x.configured ? <Pill tone="grey">Not connected</Pill> : <Pill tone="amber">Needs setup</Pill>}
        >
          {!x.configured ? (
            <div className="space-y-2 text-sm">
              <p>Xero connects with an app you register once at developer.xero.com (a free “Web app”).</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Create the app and set its redirect URI to <code>{x.redirectUri}</code></li>
                <li>Put its client ID and secret in <code>XERO_CLIENT_ID</code> and <code>XERO_CLIENT_SECRET</code>, then redeploy.</li>
                <li>Come back here and press Connect.</li>
              </ol>
              <a className="inline-flex items-center gap-1 text-cyan hover:underline" href="https://developer.xero.com/app/manage" target="_blank" rel="noreferrer">Open Xero developer portal <ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          ) : !x.connected ? (
            <div className="space-y-3 text-sm">
              <p>Send invoices to Xero as sales invoices, bring payments back, and send pay runs to Xero Payroll as draft timesheets.</p>
              {owner ? <Button asChild><a href="/api/integrations/xero/connect">Connect Xero</a></Button> : <p className="text-muted-foreground">Ask an owner to connect Xero.</p>}
            </div>
          ) : (
            <div className="space-y-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><CheckCircle2 className="mr-1.5 inline h-4 w-4 text-success" /><b>{x.tenantName}</b> <span className="text-muted-foreground">· connected {x.connectedAt ? fmtDateTime(x.connectedAt) : ""} by {x.connectedBy}</span></span>
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => xero("payments", "Payments checked")}><RefreshCw className="h-3.5 w-3.5" /> Bring payments across</Button>
                  {owner && <Button size="sm" variant="ghost" className="text-red-700" onClick={async () => { if (confirm("Disconnect Xero? Nothing in Xero is deleted.")) { await act(() => api(`/api/integrations/xero`, { method: "DELETE" }), "Xero disconnected"); refresh(); } }}><Unplug className="h-3.5 w-3.5" /> Disconnect</Button>}
                </span>
              </div>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="xa">Sales account code</Label><Input id="xa" value={s.xeroAccountCode} onChange={(e) => setS({ ...s, xeroAccountCode: e.target.value })} /><p className="text-xs text-muted-foreground">Usually 200 (Sales) in a standard AU chart of accounts.</p></div>
                <div className="space-y-1"><Label htmlFor="xs">Create invoices in Xero as</Label>
                  <Select id="xs" value={s.xeroInvoiceStatus} onChange={(e) => setS({ ...s, xeroInvoiceStatus: e.target.value as AccountingSettings["xeroInvoiceStatus"] })}>
                    <option value="DRAFT">Draft (review in Xero first)</option><option value="AUTHORISED">Approved (ready to send)</option>
                  </Select>
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <div className="eyebrow">Payroll: guards linked to Xero employees</div>
                  <Button size="sm" variant="outline" onClick={() => xero("employees", "Employees matched")}><Users className="h-3.5 w-3.5" /> Match by name or email</Button>
                </div>
                <p className="text-muted-foreground"><span className="num text-foreground">{linked}</span> of {data.guards.length} active guards linked. {linked < data.guards.length && <>Not linked: {data.guards.filter((g) => !g.linked).map((g) => g.name).join(", ")}. Add them as employees in Xero, then match again.</>}</p>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <div className="eyebrow">Payroll: pay categories → Xero earnings rates</div>
                  <Button size="sm" variant="outline" onClick={async () => { await act(async () => { setRates(((await api<{ rates: { id: string; name: string }[] }>(`/api/integrations/xero`, { method: "POST", body: JSON.stringify({ action: "earnings-rates" }) })).rates)); }); }}>Load earnings rates</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PAY_CATS.map((c) => (
                    <div key={c} className="grid grid-cols-[9.5rem_1fr] items-center gap-2">
                      <Label htmlFor={`er-${c}`} className="text-[13px] font-normal">{CATEGORY_LABEL[c]}</Label>
                      <Select id={`er-${c}`} value={s.earningsRates[c] ?? ""} onChange={(e) => setS({ ...s, earningsRates: { ...s.earningsRates, [c]: e.target.value || undefined } })}>
                        <option value="">{rates ? "Not mapped" : s.earningsRates[c] ? "Mapped (load rates to change)" : "Load rates first"}</option>
                        {(rates ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        {!rates && s.earningsRates[c] && <option value={s.earningsRates[c]}>Mapped</option>}
                      </Select>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Only categories used in a pay run need mapping. Xero then applies its own rates, tax and super when you process the pay run.</p>
              </section>
              <div className="flex justify-end"><Button onClick={save}>Save Xero settings</Button></div>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="MYOB">
            <p className="text-sm text-muted-foreground">Download invoices as a MYOB service-sales import file from <Link className="text-cyan hover:underline" href="/invoicing">Invoicing</Link>, and finalised pay runs as a MYOB timesheet file. Map the columns once when you import.</p>
            <div className="mt-3 space-y-1"><Label htmlFor="ma">Income account number</Label><Input id="ma" value={s.myobIncomeAccount} onChange={(e) => setS({ ...s, myobIncomeAccount: e.target.value })} /></div>
          </Panel>
          <Panel title="QuickBooks Online">
            <p className="text-sm text-muted-foreground">Download invoices as a QuickBooks import CSV from <Link className="text-cyan hover:underline" href="/invoicing">Invoicing</Link>. QuickBooks doesn&apos;t accept credit lines in an import; those invoices are left out of the file.</p>
            <div className="mt-3 space-y-1"><Label htmlFor="qi">Product/service name</Label><Input id="qi" value={s.qboItem} onChange={(e) => setS({ ...s, qboItem: e.target.value })} /></div>
          </Panel>
          <Panel title="Employment Hero (KeyPay)">
            <p className="text-sm text-muted-foreground">Download finalised pay runs as a timesheet file with raw start and finish times, so Employment Hero applies its own award rules. Give each guard a Payroll ID that matches their Employment Hero external ID.</p>
            <p className="mt-2 text-sm"><span className="num">{data.guards.filter((g) => g.payrollRef).length}</span> of {data.guards.length} guards have a Payroll ID.</p>
          </Panel>
          <div className="flex justify-end"><Button variant="outline" onClick={save}>Save file settings</Button></div>
        </div>
      </div>

      <h2 className="mb-2 mt-6 !font-sans text-[13px] font-semibold">Activity</h2>
      <DataTable
        cols={[
          { h: "When", c: (l) => <span className="whitespace-nowrap text-xs">{fmtDateTime(l.at)}</span> },
          { h: "System", c: (l) => PROVIDER[l.provider] ?? l.provider },
          { h: "What", c: (l) => <span className="text-xs uppercase tracking-wide text-muted-foreground">{l.kind.toLowerCase()}</span> },
          { h: "Result", c: (l) => <Pill tone={l.ok ? "green" : "red"}>{l.ok ? "OK" : "Failed"}</Pill> },
          { h: "Detail", c: (l) => <span className="text-sm">{l.message}</span> },
        ]}
        rows={data.logs}
        empty="Nothing sent or downloaded yet."
      />
    </>
  );
}
