"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";
import { EQUIPMENT_KINDS } from "@/lib/ops";
import { DataTable, Pill, ResourceDialog, StatusPill, Tabs, auDate, useAct, type Col, type Field } from "@/components/ops/kit";

interface Vehicle {
  id: string; code: string; rego: string; make: string | null; model: string | null; year: number | null; status: string; odometer: number | null;
  serviceDue: string | null; insuranceExpiry: string | null; runs: { code: string }[]; checks: { at: string; failed: string[] }[];
}
interface Check { id: string; at: string; guardName: string; odometer: number | null; fuel: string | null; failed: string[]; notes: string | null; vehicle: { code: string; rego: string } }
interface Equipment { id: string; name: string; kind: string; serial: string | null; status: string; guardId: string | null; notes: string | null }
interface Guard { id: string; firstName: string; lastName: string; active: boolean }

const VEHICLE_FIELDS: Field[] = [
  { name: "code", label: "Fleet ID", required: true, half: true, placeholder: "V-01" },
  { name: "rego", label: "Registration", required: true, half: true },
  { name: "make", label: "Make", half: true, placeholder: "Toyota" },
  { name: "model", label: "Model", half: true, placeholder: "HiLux" },
  { name: "year", label: "Year", type: "number", half: true, clearable: true },
  { name: "odometer", label: "Odometer (km)", type: "number", half: true, clearable: true },
  { name: "status", label: "Status", type: "select", required: true, options: [{ value: "ACTIVE", label: "Active" }, { value: "IN_SERVICE", label: "In for service" }, { value: "DECOMMISSIONED", label: "Decommissioned" }] },
  { name: "serviceDue", label: "Next service due", type: "date", half: true },
  { name: "insuranceExpiry", label: "Insurance expiry", type: "date", half: true },
  { name: "notes", label: "Notes", type: "textarea" },
];

const dueTone = (iso: string | null) => {
  if (!iso) return "";
  const days = (+new Date(iso) - Date.now()) / 86_400_000;
  return days < 0 ? "text-red-300" : days < 30 ? "text-amber-300" : "";
};

export default function VehiclesPage() {
  const qc = useQueryClient();
  const act = useAct();
  const [tab, setTab] = React.useState<"fleet" | "checks" | "equipment">("fleet");
  const vehicles = useQuery<Vehicle[]>({ queryKey: ["vehicles"], queryFn: () => api(`/api/vehicles`) });
  const checks = useQuery<Check[]>({ queryKey: ["vehicle-checks"], queryFn: () => api(`/api/vehicle-checks`), enabled: tab === "checks" });
  const equipment = useQuery<Equipment[]>({ queryKey: ["equipment"], queryFn: () => api(`/api/equipment`) });
  const guards = useQuery<Guard[]>({ queryKey: ["guards", "all"], queryFn: () => api(`/api/guards`) });
  const [vOpen, setVOpen] = React.useState(false);
  const [vEdit, setVEdit] = React.useState<Vehicle | undefined>();
  const [eOpen, setEOpen] = React.useState(false);
  const [eEdit, setEEdit] = React.useState<Equipment | undefined>();

  const guardName = (id: string | null) => { const g = guards.data?.find((x) => x.id === id); return g ? `${g.firstName} ${g.lastName}` : null; };
  const remove = async (url: string, key: string, what: string) => {
    if (!confirm(`Delete ${what}?`)) return;
    if (await act(() => api(url, { method: "DELETE" }), "Deleted")) qc.invalidateQueries({ queryKey: [key] });
  };
  const del = (onClick: () => void) => (
    <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="ghost" className="px-2 text-red-300" aria-label="Delete" onClick={onClick}><Trash2 className="h-3.5 w-3.5" /></Button>
    </span>
  );

  const vCols: Col<Vehicle>[] = [
    { h: "ID", c: (v) => <span className="font-mono font-medium">{v.code}</span> },
    { h: "Rego", c: (v) => <span className="font-mono">{v.rego}</span> },
    { h: "Vehicle", c: (v) => [v.year, v.make, v.model].filter(Boolean).join(" ") || "—" },
    { h: "Runs", c: (v) => (v.runs.length ? <span className="font-mono text-xs">{v.runs.map((r) => r.code).join(", ")}</span> : <span className="text-muted-foreground">—</span>) },
    { h: "Status", c: (v) => <StatusPill status={v.status} /> },
    { h: "Odometer", c: (v) => (v.odometer ? <span className="num">{v.odometer.toLocaleString()} km</span> : "—") },
    { h: "Service due", c: (v) => <span className={dueTone(v.serviceDue)}>{auDate(v.serviceDue)}</span> },
    { h: "Insurance", c: (v) => <span className={dueTone(v.insuranceExpiry)}>{auDate(v.insuranceExpiry)}</span> },
    { h: "Last check", c: (v) => { const c = v.checks[0]; return c ? <span className="text-xs">{fmtDateTime(c.at)} {c.failed.length ? <Pill tone="red" className="ml-1">{c.failed.length} fail</Pill> : <Pill tone="green" className="ml-1">Pass</Pill>}</span> : <span className="text-muted-foreground">Never</span>; } },
    { h: "", c: (v) => del(() => remove(`/api/vehicles/${v.id}`, "vehicles", `${v.code} (${v.rego})`)) },
  ];
  const cCols: Col<Check>[] = [
    { h: "When", c: (c) => <span className="whitespace-nowrap text-xs">{fmtDateTime(c.at)}</span> },
    { h: "Vehicle", c: (c) => <span className="font-mono">{c.vehicle.code} · {c.vehicle.rego}</span> },
    { h: "Guard", c: (c) => c.guardName },
    { h: "Odometer", c: (c) => (c.odometer ? <span className="num">{c.odometer.toLocaleString()} km</span> : "—") },
    { h: "Fuel", c: (c) => c.fuel ?? "—" },
    { h: "Result", c: (c) => (c.failed.length ? <Pill tone="red">Failed</Pill> : <Pill tone="green">Pass</Pill>) },
    { h: "Failed items / notes", c: (c) => <span className="text-xs text-muted-foreground">{[c.failed.join(", "), c.notes].filter(Boolean).join(" — ") || "—"}</span> },
  ];
  const eCols: Col<Equipment>[] = [
    { h: "Item", c: (e) => <span className="font-medium">{e.name}</span> },
    { h: "Type", c: (e) => e.kind },
    { h: "Serial", c: (e) => <span className="font-mono text-xs">{e.serial ?? "—"}</span> },
    { h: "Status", c: (e) => <StatusPill status={e.status} /> },
    { h: "Held by", c: (e) => guardName(e.guardId) ?? <span className="text-muted-foreground">—</span> },
    { h: "Notes", c: (e) => <span className="text-xs text-muted-foreground">{e.notes ?? ""}</span> },
    { h: "", c: (e) => del(() => remove(`/api/equipment/${e.id}`, "equipment", e.name)) },
  ];

  return (
    <>
      <PageHeader
        title="Vehicles & Equipment"
        description="The patrol fleet, the checks guards do before taking a vehicle out, and issued equipment."
        actions={tab === "equipment"
          ? <Button onClick={() => { setEEdit(undefined); setEOpen(true); }}><Plus className="h-4 w-4" /> Add equipment</Button>
          : <Button onClick={() => { setVEdit(undefined); setVOpen(true); }}><Plus className="h-4 w-4" /> Add vehicle</Button>}
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "fleet", label: "Fleet", count: vehicles.data?.length }, { key: "checks", label: "Vehicle checks" }, { key: "equipment", label: "Equipment", count: equipment.data?.length }]} />
      {tab === "fleet" && <DataTable cols={vCols} rows={vehicles.data ?? []} onRow={(v) => { setVEdit(v); setVOpen(true); }} empty="No vehicles yet." />}
      {tab === "checks" && <DataTable cols={cCols} rows={checks.data ?? []} empty="No checks submitted yet. Guards complete one in the app before starting a patrol run that has a vehicle." />}
      {tab === "equipment" && <DataTable cols={eCols} rows={equipment.data ?? []} onRow={(e) => { setEEdit(e); setEOpen(true); }} empty="No equipment recorded yet." />}

      <ResourceDialog open={vOpen} onOpenChange={setVOpen} title={vEdit ? `Edit ${vEdit.code}` : "Add vehicle"} endpoint="/api/vehicles" fields={VEHICLE_FIELDS}
        initial={vEdit as unknown as Record<string, unknown> | undefined} onSaved={() => { qc.invalidateQueries({ queryKey: ["vehicles"] }); }} />
      <ResourceDialog open={eOpen} onOpenChange={setEOpen} title={eEdit ? "Edit equipment" : "Add equipment"} endpoint="/api/equipment"
        initial={eEdit as unknown as Record<string, unknown> | undefined} onSaved={() => { qc.invalidateQueries({ queryKey: ["equipment"] }); }}
        fields={[
          { name: "name", label: "Item", required: true, half: true, placeholder: "Radio 07" },
          { name: "kind", label: "Type", type: "select", required: true, half: true, options: EQUIPMENT_KINDS.map((k) => ({ value: k, label: k })) },
          { name: "serial", label: "Serial / asset no.", half: true },
          { name: "status", label: "Status", type: "select", required: true, half: true, options: ["AVAILABLE", "IN_USE", "MAINTENANCE", "LOST"].map((s) => ({ value: s, label: s.replace("_", " ") })) },
          { name: "guardId", label: "Held by", type: "select", options: (guards.data ?? []).filter((g) => g.active).map((g) => ({ value: g.id, label: `${g.firstName} ${g.lastName}` })) },
          { name: "notes", label: "Notes", type: "textarea" },
        ]} />
    </>
  );
}
