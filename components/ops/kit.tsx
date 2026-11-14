"use client";
// Building blocks shared by the operations screens: tone pills, tabs, stat
// tiles, a paginated table and a config-driven create/edit dialog.
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

export type Tone = "green" | "amber" | "red" | "crit" | "blue" | "grey" | "cyan" | "purple";

const TONE: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40",
  amber: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  red: "bg-red-500/15 text-red-700 border-red-500/40",
  crit: "bg-red-600 text-white border-red-600",
  blue: "bg-sky-500/15 text-sky-700 border-sky-500/40",
  cyan: "bg-cyan/15 text-cyan border-cyan/40",
  purple: "bg-purple-500/15 text-purple-700 border-purple-500/40",
  grey: "bg-muted text-muted-foreground border-border",
};

// One place that decides what colour a status word gets, so "PAID" is green
// and "OVERDUE" is red on every screen.
const STATUS_TONE: Record<string, Tone> = {
  CRITICAL: "crit", HIGH: "red", MEDIUM: "amber", LOW: "grey",
  UNASSIGNED: "red", DISPATCHED: "amber", EN_ROUTE: "amber", ON_SCENE: "blue", RESOLVED: "green",
  UNVERIFIED: "grey", CCTV_CONFIRMED: "blue", GUARD_CONFIRMED: "blue", FALSE_ALARM: "grey",
  OPEN: "red", UNDER_REVIEW: "amber", ESCALATED: "crit", ARCHIVED: "grey",
  SCHEDULED: "grey", ACTIVE: "cyan", COMPLETED: "green", PARTIAL: "amber", MISSED: "red",
  DRAFT: "grey", SENT: "blue", PAID: "green", OVERDUE: "red", VOID: "grey",
  ASSIGNED: "blue", PASSED: "green", FAILED: "red",
  PENDING: "amber", ACCEPTED: "green", DECLINED: "red", APPROVED: "blue", DISPUTED: "red", SUSPENDED: "red",
  IN_SERVICE: "amber", DECOMMISSIONED: "grey", AVAILABLE: "green", IN_USE: "blue", MAINTENANCE: "amber", LOST: "red",
};

export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <Badge className={cn(TONE[tone], className)}>{children}</Badge>;
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return <Pill tone={STATUS_TONE[status] ?? "grey"} className={className}>{status.replace(/_/g, " ")}</Pill>;
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-1 border-b" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm",
            value === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="num rounded bg-muted px-1.5 text-[10.5px] leading-4 text-muted-foreground">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="rounded-[10px] border bg-card p-3.5">
      <div className="eyebrow truncate">{label}</div>
      <div className={cn("num font-display mt-1.5 text-2xl font-bold leading-none", tone)}>{value}</div>
      {sub && <div className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export interface Col<T> { h: string; c: (row: T) => React.ReactNode; className?: string }

export function DataTable<T extends { id: string }>({ cols, rows, empty, onRow, pageSize = 15 }: { cols: Col<T>[]; rows: T[]; empty: string; onRow?: (row: T) => void; pageSize?: number }) {
  const [page, setPage] = React.useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const view = rows.slice(current * pageSize, current * pageSize + pageSize);
  return (
    <div className="overflow-hidden rounded-[10px] border bg-card">
      <Table>
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c.h} className={c.className}>{c.h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {view.length === 0 && <TableRow><TableCell colSpan={cols.length} className="py-10 text-center text-muted-foreground">{empty}</TableCell></TableRow>}
          {view.map((r) => (
            <TableRow key={r.id} className={onRow ? "cursor-pointer" : undefined} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map((c) => <TableCell key={c.h} className={c.className}>{c.c(r)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="num">Page {current + 1} of {pages} · {rows.length} rows</span>
          <Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Prev</Button>
          <Button size="sm" variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

/** Runs an API call, toasts the outcome, and reports success to the caller. */
export function useAct() {
  const { toast } = useToast();
  return React.useCallback(
    async (fn: () => Promise<unknown>, ok?: string, okDescription?: string): Promise<boolean> => {
      try {
        await fn();
        if (ok) toast({ title: ok, description: okDescription, variant: "success" });
        return true;
      } catch (e) {
        toast({ title: "That didn't work", description: e instanceof Error ? e.message : "", variant: "error" });
        return false;
      }
    },
    [toast],
  );
}

export interface Field {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "textarea" | "checkbox" | "email" | "tel";
  options?: { value: string; label: string }[];
  required?: boolean;
  half?: boolean;
  placeholder?: string;
  step?: string;
  /** Number fields only: an empty box clears the stored value (sends null). */
  clearable?: boolean;
  hint?: string;
}

type Values = Record<string, string | boolean>;

function toFormValues(fields: Field[], initial: Record<string, unknown> | undefined): Values {
  const out: Values = {};
  for (const f of fields) {
    const v = initial?.[f.name];
    if (f.type === "checkbox") out[f.name] = v === undefined ? true : Boolean(v);
    else if (f.type === "date") out[f.name] = typeof v === "string" ? v.slice(0, 10) : "";
    else out[f.name] = v === null || v === undefined ? (f.type === "select" && f.required ? f.options?.[0]?.value ?? "" : "") : String(v);
  }
  return out;
}

export function ResourceDialog({
  open, onOpenChange, title, description, fields, initial, endpoint, onSaved, children, extraPayload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  fields: Field[];
  initial?: Record<string, unknown> & { id?: string };
  endpoint: string;
  onSaved?: (saved: { id: string }) => void | Promise<void>;
  /** Extra controls rendered under the fields (e.g. a stop editor). */
  children?: React.ReactNode;
  extraPayload?: () => Record<string, unknown>;
}) {
  const act = useAct();
  const [values, setValues] = React.useState<Values>({});
  const [saving, setSaving] = React.useState(false);
  const snapshot = React.useRef({ fields, initial });
  React.useEffect(() => { snapshot.current = { fields, initial }; });
  // Reset only when the dialog opens; the parent re-renders on every poll.
  React.useEffect(() => { if (open) setValues(toFormValues(snapshot.current.fields, snapshot.current.initial)); }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === "number" && v === "") { if (f.clearable) payload[f.name] = null; continue; }
      payload[f.name] = v;
    }
    Object.assign(payload, extraPayload?.());
    setSaving(true);
    let saved: { id: string } | null = null;
    const ok = await act(async () => {
      saved = await api<{ id: string }>(initial?.id ? `${endpoint}/${initial.id}` : endpoint, {
        method: initial?.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    }, initial?.id ? "Saved" : "Created");
    if (ok && saved) await onSaved?.(saved);
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:!max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => {
              const id = `f-${f.name}`;
              const v = values[f.name];
              const set = (val: string | boolean) => setValues((x) => ({ ...x, [f.name]: val }));
              if (f.type === "checkbox") {
                return (
                  <label key={f.name} className="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} /> {f.label}
                  </label>
                );
              }
              return (
                <div key={f.name} className={cn("space-y-1", f.half ? "col-span-2 sm:col-span-1" : "col-span-2")}>
                  <Label htmlFor={id}>{f.label}</Label>
                  {f.type === "select" ? (
                    <Select id={id} value={String(v ?? "")} onChange={(e) => set(e.target.value)} required={f.required}>
                      {!f.required && <option value="">—</option>}
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  ) : f.type === "textarea" ? (
                    <Textarea id={id} rows={3} value={String(v ?? "")} onChange={(e) => set(e.target.value)} required={f.required} placeholder={f.placeholder} />
                  ) : (
                    <Input id={id} type={f.type ?? "text"} step={f.step} value={String(v ?? "")} onChange={(e) => set(e.target.value)} required={f.required} placeholder={f.placeholder} />
                  )}
                  {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                </div>
              );
            })}
          </div>
          {children}
          <DialogFooter className="dialog-footer-sticky">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Scrollable checkbox list for "which sites / guards belong here". */
export function MultiPick({ label, options, value, onChange }: { label: string; options: { id: string; name: string; note?: string }[]; value: Set<string>; onChange: (v: Set<string>) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span className="num text-xs text-muted-foreground">{value.size} selected</span>
      </div>
      <div className="max-h-44 overflow-y-auto rounded-md border bg-background/40 p-1">
        {options.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nothing to choose from yet.</p>}
        {options.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
            <input
              type="checkbox"
              checked={value.has(o.id)}
              onChange={(e) => {
                const next = new Set(value);
                if (e.target.checked) next.add(o.id); else next.delete(o.id);
                onChange(next);
              }}
            />
            <span className="flex-1 truncate">{o.name}</span>
            {o.note && <span className="text-xs text-muted-foreground">{o.note}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars for "count by category". Values are labelled directly. */
export function BarList({ data, unit = "", empty = "No data in this period." }: { data: { label: string; value: number }[]; unit?: string; empty?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground" title={d.label}>{d.label}</span>
          <span className="h-2 overflow-hidden rounded-sm bg-muted">
            <span className="block h-full rounded-sm bg-primary" style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="num text-right text-[13px]">{d.value}{unit}</span>
        </li>
      ))}
    </ul>
  );
}

export function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[10px] border bg-card", className)}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="!font-sans text-[13px] font-semibold !tracking-normal">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export const auDate = (iso: string | Date | null | undefined): string => {
  if (!iso) return "—";
  const s = typeof iso === "string" ? iso : iso.toISOString();
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
