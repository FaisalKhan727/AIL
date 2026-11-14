"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { DataTable, MultiPick, Pill, ResourceDialog, auDate, useAct, type Col, type Field } from "@/components/ops/kit";

interface Client {
  id: string; name: string; abn: string | null; contactName: string | null; contactPhone: string | null; contactEmail: string | null;
  contractEnd: string | null; paymentTermsDays: number; slaPatrolPct: number; slaAlarmMins: number; active: boolean;
  sites: { id: string; name: string }[]; _count: { runs: number; invoices: number };
}
interface Site { id: string; name: string; active: boolean; clientId: string | null }

const FIELDS: Field[] = [
  { name: "name", label: "Client name", required: true },
  { name: "abn", label: "ABN", half: true },
  { name: "contactName", label: "Operations contact", half: true },
  { name: "contactPhone", label: "Contact mobile (E.164)", type: "tel", half: true, placeholder: "+61412345678", hint: "Used for invoice SMS" },
  { name: "contactEmail", label: "Contact email", type: "email", half: true },
  { name: "billingEmail", label: "Billing email", type: "email", half: true },
  { name: "paymentTermsDays", label: "Payment terms (days)", type: "number", half: true },
  { name: "contractStart", label: "Contract start", type: "date", half: true },
  { name: "contractEnd", label: "Contract end", type: "date", half: true },
  { name: "slaPatrolPct", label: "SLA: patrol completion %", type: "number", half: true },
  { name: "slaAlarmMins", label: "SLA: alarm response (mins)", type: "number", half: true },
  { name: "notes", label: "Notes", type: "textarea" },
  { name: "active", label: "Active client", type: "checkbox" },
];

export default function ClientsPage() {
  const qc = useQueryClient();
  const act = useAct();
  const { data: clients = [], isLoading } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: () => api(`/api/clients`) });
  const { data: sites = [] } = useQuery<Site[]>({ queryKey: ["sites", "all"], queryFn: () => api(`/api/sites`) });
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Client | undefined>();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  function edit(c?: Client) {
    setEditing(c);
    setPicked(new Set(c?.sites.map((s) => s.id) ?? []));
    setOpen(true);
  }
  const refresh = () => { qc.invalidateQueries({ queryKey: ["clients"] }); qc.invalidateQueries({ queryKey: ["sites"] }); };

  const soon = (iso: string | null) => iso !== null && +new Date(iso) - Date.now() < 60 * 86_400_000;
  const cols: Col<Client>[] = [
    { h: "Client", c: (c) => <><span className="font-medium">{c.name}</span>{!c.active && <Pill tone="grey" className="ml-2">Inactive</Pill>}{c.abn && <div className="font-mono text-xs text-muted-foreground">ABN {c.abn}</div>}</> },
    { h: "Contact", c: (c) => <>{c.contactName ?? "—"}{c.contactPhone && <div className="font-mono text-xs text-muted-foreground">{c.contactPhone}</div>}</> },
    { h: "Sites", c: (c) => (c.sites.length ? <span title={c.sites.map((s) => s.name).join(", ")}>{c.sites.length} · <span className="text-muted-foreground">{c.sites.slice(0, 2).map((s) => s.name).join(", ")}{c.sites.length > 2 ? "…" : ""}</span></span> : <span className="text-muted-foreground">None</span>) },
    { h: "Patrol runs", c: (c) => <span className="num">{c._count.runs}</span> },
    { h: "SLA", c: (c) => <span className="text-xs text-muted-foreground">{c.slaPatrolPct}% patrols · {c.slaAlarmMins} min response</span> },
    { h: "Contract ends", c: (c) => <span className={soon(c.contractEnd) ? "text-amber-700" : ""}>{auDate(c.contractEnd)}</span> },
    { h: "Terms", c: (c) => <span className="num">{c.paymentTermsDays} days</span> },
    {
      h: "", className: "text-right",
      c: (c) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" className="px-2" aria-label="Edit client" onClick={() => edit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="px-2 text-red-700" aria-label="Delete client" onClick={async () => {
            if (!confirm(`Delete ${c.name}? Its sites are kept and become unassigned.`)) return;
            if (await act(() => api(`/api/clients/${c.id}`, { method: "DELETE" }), "Client deleted")) refresh();
          }}><Trash2 className="h-3.5 w-3.5" /></Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Clients" description="Who you work for, which sites are theirs, and the service levels you've promised." actions={<Button onClick={() => edit()}><Plus className="h-4 w-4" /> Add client</Button>} />
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : <DataTable cols={cols} rows={clients} onRow={edit} empty="No clients yet. Add one, then link its sites and patrol runs." />}
      <ResourceDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit client" : "Add client"}
        endpoint="/api/clients"
        fields={FIELDS}
        initial={editing as unknown as Record<string, unknown> | undefined}
        onSaved={async (saved) => {
          await api(`/api/clients/${saved.id}/sites`, { method: "PUT", body: JSON.stringify({ siteIds: Array.from(picked) }) });
          refresh();
        }}
      >
        <MultiPick
          label="Sites managed for this client"
          options={sites.filter((s) => s.active || picked.has(s.id)).map((s) => ({ id: s.id, name: s.name, note: s.clientId && s.clientId !== editing?.id ? "with another client" : undefined }))}
          value={picked}
          onChange={setPicked}
        />
      </ResourceDialog>
    </>
  );
}
