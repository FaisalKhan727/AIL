"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Star, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/fetcher";
import { money } from "@/lib/ops";
import { DataTable, MultiPick, ResourceDialog, Stat, StatusPill, Tabs, auDate, useAct, type Col, type Field } from "@/components/ops/kit";

interface Sub {
  id: string; name: string; abn: string | null; contactName: string | null; phone: string | null; email: string | null; status: string;
  specialties: string | null; insuranceExpiry: string | null; rating: number | null;
  guards: { id: string; firstName: string; lastName: string; active: boolean }[]; _count: { jobRequests: number; invoices: number };
}
interface Job { id: string; subcontractorId: string; subcontractor: { name: string }; siteId: string | null; description: string; startDate: string; endDate: string; headcount: number; status: string }
interface Inv { id: string; subcontractorId: string; subcontractor: { name: string }; number: string; period: string | null; amount: string; status: string; note: string | null; receivedAt: string }
interface Guard { id: string; firstName: string; lastName: string; active: boolean; subcontractorId: string | null }

const SUB_FIELDS: Field[] = [
  { name: "name", label: "Company name", required: true },
  { name: "abn", label: "ABN", half: true },
  { name: "status", label: "Status", type: "select", required: true, half: true, options: [{ value: "ACTIVE", label: "Active" }, { value: "PENDING", label: "Pending verification" }, { value: "SUSPENDED", label: "Suspended" }] },
  { name: "contactName", label: "Primary contact", half: true },
  { name: "phone", label: "Phone", type: "tel", half: true },
  { name: "email", label: "Email", type: "email", half: true },
  { name: "insuranceExpiry", label: "Public liability expiry", type: "date", half: true },
  { name: "specialties", label: "Specialties", placeholder: "Events, mobile patrol, retail…" },
  { name: "rating", label: "Rating (1–5)", type: "number", half: true, clearable: true },
  { name: "notes", label: "Notes", type: "textarea" },
];

export default function SubcontractorsPage() {
  const qc = useQueryClient();
  const act = useAct();
  const [tab, setTab] = React.useState<"companies" | "jobs" | "invoices">("companies");
  const subs = useQuery<Sub[]>({ queryKey: ["subcontractors"], queryFn: () => api(`/api/subcontractors`) });
  const jobs = useQuery<Job[]>({ queryKey: ["job-requests"], queryFn: () => api(`/api/job-requests`) });
  const invs = useQuery<Inv[]>({ queryKey: ["sub-invoices"], queryFn: () => api(`/api/sub-invoices`) });
  const guards = useQuery<Guard[]>({ queryKey: ["guards", "all"], queryFn: () => api(`/api/guards`) });
  const sites = useQuery<{ id: string; name: string; active: boolean }[]>({ queryKey: ["sites", "all"], queryFn: () => api(`/api/sites`) });

  const [open, setOpen] = React.useState<"sub" | "job" | "inv" | null>(null);
  const [sub, setSub] = React.useState<Sub | undefined>();
  const [job, setJob] = React.useState<Job | undefined>();
  const [inv, setInv] = React.useState<Inv | undefined>();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  const refresh = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const setStatus = (url: string, status: string, key: string) => act(async () => { await api(url, { method: "PATCH", body: JSON.stringify({ status }) }); refresh(key); });
  const remove = async (url: string, key: string, what: string) => {
    if (!confirm(`Delete ${what}?`)) return;
    if (await act(() => api(url, { method: "DELETE" }), "Deleted")) refresh(key, "guards");
  };
  const del = (fn: () => void) => <span onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" className="px-2 text-red-700" aria-label="Delete" onClick={fn}><Trash2 className="h-3.5 w-3.5" /></Button></span>;
  const subOptions = (subs.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  const all = subs.data ?? [];

  const sCols: Col<Sub>[] = [
    { h: "Company", c: (s) => <><span className="font-medium">{s.name}</span>{s.abn && <div className="font-mono text-xs text-muted-foreground">ABN {s.abn}</div>}</> },
    { h: "Contact", c: (s) => <>{s.contactName ?? "—"}<div className="text-xs text-muted-foreground">{[s.phone, s.email].filter(Boolean).join(" · ")}</div></> },
    { h: "Specialties", c: (s) => <span className="text-xs text-muted-foreground">{s.specialties ?? "—"}</span> },
    { h: "Guards supplied", c: (s) => <span className="num">{s.guards.filter((g) => g.active).length}</span> },
    { h: "Insurance", c: (s) => <span className={s.insuranceExpiry && +new Date(s.insuranceExpiry) < Date.now() ? "text-red-700" : ""}>{auDate(s.insuranceExpiry)}</span> },
    { h: "Rating", c: (s) => (s.rating ? <span className="flex items-center gap-1 text-amber-700"><Star className="h-3.5 w-3.5 fill-current" /><span className="num">{s.rating}</span></span> : <span className="text-muted-foreground">—</span>) },
    { h: "Status", c: (s) => <StatusPill status={s.status} /> },
    { h: "", c: (s) => del(() => remove(`/api/subcontractors/${s.id}`, "subcontractors", `${s.name} and its job requests and invoices`)) },
  ];
  const jCols: Col<Job>[] = [
    { h: "Subcontractor", c: (j) => <span className="font-medium">{j.subcontractor.name}</span> },
    { h: "Request", c: (j) => j.description },
    { h: "Site", c: (j) => sites.data?.find((s) => s.id === j.siteId)?.name ?? <span className="text-muted-foreground">—</span> },
    { h: "Dates", c: (j) => <span className="num whitespace-nowrap text-xs">{auDate(j.startDate)} → {auDate(j.endDate)}</span> },
    { h: "Guards", c: (j) => <span className="num">{j.headcount}</span> },
    { h: "Status", c: (j) => (
      <span onClick={(e) => e.stopPropagation()}>
        <Select className="h-8 w-36 text-[13px]" value={j.status} aria-label="Status" onChange={(e) => setStatus(`/api/job-requests/${j.id}`, e.target.value, "job-requests")}>
          {["PENDING", "ACCEPTED", "DECLINED", "COMPLETED"].map((s) => <option key={s}>{s}</option>)}
        </Select>
      </span>
    ) },
    { h: "", c: (j) => del(() => remove(`/api/job-requests/${j.id}`, "job-requests", "this job request")) },
  ];
  const iCols: Col<Inv>[] = [
    { h: "Invoice", c: (i) => <span className="font-mono">{i.number}</span> },
    { h: "Subcontractor", c: (i) => <span className="font-medium">{i.subcontractor.name}</span> },
    { h: "Period", c: (i) => i.period ?? "—" },
    { h: "Received", c: (i) => <span className="num text-xs">{auDate(i.receivedAt)}</span> },
    { h: "Amount", c: (i) => <span className="num">{money(i.amount)}</span>, className: "text-right" },
    { h: "Status", c: (i) => <StatusPill status={i.status} /> },
    { h: "", className: "text-right", c: (i) => (
      <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {i.status === "PENDING" && <Button size="sm" variant="outline" onClick={() => setStatus(`/api/sub-invoices/${i.id}`, "APPROVED", "sub-invoices")}>Approve</Button>}
        {i.status === "APPROVED" && <Button size="sm" variant="outline" onClick={() => setStatus(`/api/sub-invoices/${i.id}`, "PAID", "sub-invoices")}>Mark paid</Button>}
        {(i.status === "PENDING" || i.status === "APPROVED") && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setStatus(`/api/sub-invoices/${i.id}`, "DISPUTED", "sub-invoices")}>Dispute</Button>}
        {del(() => remove(`/api/sub-invoices/${i.id}`, "sub-invoices", `invoice ${i.number}`))}
      </span>
    ) },
  ];
  const owing = (invs.data ?? []).filter((i) => i.status === "PENDING" || i.status === "APPROVED").reduce((n, i) => n + Number(i.amount), 0);

  return (
    <>
      <PageHeader
        title="Subcontractors"
        description="Partner companies, the guards they supply, the work you've asked them for and what they've billed."
        actions={
          tab === "companies" ? <Button onClick={() => { setSub(undefined); setPicked(new Set()); setOpen("sub"); }}><Plus className="h-4 w-4" /> Add subcontractor</Button>
          : tab === "jobs" ? <Button disabled={all.length === 0} onClick={() => { setJob(undefined); setOpen("job"); }}><Plus className="h-4 w-4" /> New job request</Button>
          : <Button disabled={all.length === 0} onClick={() => { setInv(undefined); setOpen("inv"); }}><Plus className="h-4 w-4" /> Record invoice</Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active subcontractors" value={all.filter((s) => s.status === "ACTIVE").length} />
        <Stat label="Guards supplied" value={all.reduce((n, s) => n + s.guards.filter((g) => g.active).length, 0)} />
        <Stat label="Open job requests" value={(jobs.data ?? []).filter((j) => j.status === "PENDING").length} />
        <Stat label="Invoices to pay" value={money(owing)} tone={owing > 0 ? "text-warning" : undefined} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "companies", label: "Companies", count: all.length }, { key: "jobs", label: "Job requests", count: jobs.data?.length }, { key: "invoices", label: "Invoices received", count: invs.data?.length }]} />
      {tab === "companies" && <DataTable cols={sCols} rows={all} onRow={(s) => { setSub(s); setPicked(new Set(s.guards.map((g) => g.id))); setOpen("sub"); }} empty="No subcontractors yet." />}
      {tab === "jobs" && <DataTable cols={jCols} rows={jobs.data ?? []} onRow={(j) => { setJob(j); setOpen("job"); }} empty="No job requests yet." />}
      {tab === "invoices" && <DataTable cols={iCols} rows={invs.data ?? []} onRow={(i) => { setInv(i); setOpen("inv"); }} empty="No subcontractor invoices recorded." />}

      <ResourceDialog open={open === "sub"} onOpenChange={(v) => setOpen(v ? "sub" : null)} title={sub ? "Edit subcontractor" : "Add subcontractor"} endpoint="/api/subcontractors" fields={SUB_FIELDS}
        initial={sub as unknown as Record<string, unknown> | undefined}
        onSaved={async (saved) => {
          await api(`/api/subcontractors/${saved.id}/guards`, { method: "PUT", body: JSON.stringify({ guardIds: Array.from(picked) }) });
          refresh("subcontractors", "guards");
        }}>
        <MultiPick
          label="Guards supplied by this company"
          options={(guards.data ?? []).filter((g) => g.active || picked.has(g.id)).map((g) => ({ id: g.id, name: `${g.firstName} ${g.lastName}`, note: g.subcontractorId && g.subcontractorId !== sub?.id ? "with another subcontractor" : undefined }))}
          value={picked}
          onChange={setPicked}
        />
        <p className="text-xs text-muted-foreground">Their guards are ordinary guard records, so they can be rostered, hold licences in the compliance register and use the guard app.</p>
      </ResourceDialog>
      <ResourceDialog open={open === "job"} onOpenChange={(v) => setOpen(v ? "job" : null)} title={job ? "Edit job request" : "New job request"} endpoint="/api/job-requests"
        initial={job as unknown as Record<string, unknown> | undefined} onSaved={() => refresh("job-requests", "subcontractors")}
        fields={[
          { name: "subcontractorId", label: "Subcontractor", type: "select", required: true, options: subOptions },
          { name: "description", label: "What you need", required: true, placeholder: "4 crowd controllers for the Friday–Sunday expo" },
          { name: "siteId", label: "Site", type: "select", options: (sites.data ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })) },
          { name: "startDate", label: "From", type: "date", required: true, half: true },
          { name: "endDate", label: "To", type: "date", required: true, half: true },
          { name: "headcount", label: "Guards required", type: "number", half: true },
        ]} />
      <ResourceDialog open={open === "inv"} onOpenChange={(v) => setOpen(v ? "inv" : null)} title={inv ? "Edit invoice" : "Record subcontractor invoice"} endpoint="/api/sub-invoices"
        initial={inv as unknown as Record<string, unknown> | undefined} onSaved={() => refresh("sub-invoices", "subcontractors")}
        fields={[
          { name: "subcontractorId", label: "Subcontractor", type: "select", required: true, options: subOptions },
          { name: "number", label: "Their invoice number", required: true, half: true },
          { name: "amount", label: "Amount ($, inc. GST)", type: "number", step: "0.01", required: true, half: true },
          { name: "period", label: "Period covered", placeholder: "1–14 Nov" },
          { name: "note", label: "Note", type: "textarea" },
        ]} />
    </>
  );
}
