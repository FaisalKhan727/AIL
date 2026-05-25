"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Settings as SettingsIcon, Trash2, FileText } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/date";

interface InvoiceRow {
  id: string;
  source: string;
  periodYear: number;
  periodMonth: number;
  alarmCount: number;
  ratePerAlarm: number;
  totalAmount: number;
  generatedAt: string;
}

interface RateRow {
  key: string;
  slug: string;
  rate: number;
}

interface InvoicesResponse {
  invoices: InvoiceRow[];
  rates: RateRow[];
  sources: string[];
}

function monthName(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
}

export default function InvoicesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [ratesOpen, setRatesOpen] = React.useState(false);

  const { data, isLoading } = useQuery<InvoicesResponse>({
    queryKey: ["invoices"],
    queryFn: () => api("/api/invoices"),
  });

  async function onDelete(inv: InvoiceRow) {
    if (!confirm(`Delete the ${inv.source} invoice for ${monthName(inv.periodMonth, inv.periodYear)}? You can regenerate it any time.`)) return;
    try {
      await api(`/api/invoices/${inv.id}`, { method: "DELETE" });
      toast({ title: "Invoice deleted", variant: "success" });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: unknown) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        description={`${data?.invoices.length ?? 0} generated invoice${data?.invoices.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setRatesOpen(true)}>
              <SettingsIcon className="h-4 w-4" /> Manage rates
            </Button>
            <Button onClick={() => setGenerateOpen(true)}>
              <Plus className="h-4 w-4" /> Generate invoice
            </Button>
          </>
        }
      />

      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Alarms</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              )}
              {!isLoading && (data?.invoices.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No invoices yet. Click <em>Generate invoice</em> to create one for a source + month.
                  </TableCell>
                </TableRow>
              )}
              {data?.invoices.map((i) => (
                <TableRow key={i.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">{monthName(i.periodMonth, i.periodYear)}</TableCell>
                  <TableCell>{i.source}</TableCell>
                  <TableCell>{i.alarmCount}</TableCell>
                  <TableCell>{fmtMoney(i.ratePerAlarm)}</TableCell>
                  <TableCell className="font-semibold text-brand-navy">{fmtMoney(i.totalAmount)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDateTime(i.generatedAt)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <a
                      href={`/api/invoices/${i.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline mr-3"
                    >
                      <Download className="h-3.5 w-3.5" /> PDF
                    </a>
                    <button onClick={() => onDelete(i)} className="text-sm text-red-600 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5 inline" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile: card list */}
      <div className="md:hidden space-y-2">
        {isLoading && <Card><CardContent className="py-8 text-center text-muted-foreground">Loading…</CardContent></Card>}
        {!isLoading && (data?.invoices.length ?? 0) === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No invoices yet.</CardContent></Card>
        )}
        {data?.invoices.map((i) => (
          <Card key={i.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{i.source}</p>
                  <p className="text-xs text-muted-foreground">{monthName(i.periodMonth, i.periodYear)}</p>
                </div>
                <p className="font-semibold text-brand-navy">{fmtMoney(i.totalAmount)}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {i.alarmCount} alarms · {fmtMoney(i.ratePerAlarm)} each
              </p>
              <div className="mt-2 flex items-center gap-3">
                <a
                  href={`/api/invoices/${i.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-brand-navy"
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </a>
                <button onClick={() => onDelete(i)} className="ml-auto text-sm text-red-600">
                  <Trash2 className="h-3.5 w-3.5 inline" /> Delete
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <GenerateInvoiceDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        sources={data?.sources ?? []}
        rates={data?.rates ?? []}
        onGenerated={() => qc.invalidateQueries({ queryKey: ["invoices"] })}
      />
      <ManageRatesDialog
        open={ratesOpen}
        onOpenChange={setRatesOpen}
        sources={data?.sources ?? []}
        rates={data?.rates ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["invoices"] })}
      />
    </>
  );
}

// -----------------------------------------------------------------------------
// Generate invoice dialog
// -----------------------------------------------------------------------------

function GenerateInvoiceDialog({
  open,
  onOpenChange,
  sources,
  rates,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sources: string[];
  rates: RateRow[];
  onGenerated?: () => void;
}) {
  const { toast } = useToast();
  const now = new Date();
  const [source, setSource] = React.useState("");
  const [year, setYear] = React.useState<number>(now.getFullYear());
  const [month, setMonth] = React.useState<number>(now.getMonth() + 1);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSource(sources[0] ?? "");
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Look up the configured rate for the chosen source (for preview).
  const configuredRate = React.useMemo(() => {
    if (!source) return null;
    const slug = source.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const r = rates.find((x) => x.slug === slug);
    return r ? r.rate : 0;
  }, [source, rates]);

  async function onSubmit() {
    if (!source) {
      toast({ title: "Pick a source", variant: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<{ id: string; alarmCount: number; totalAmount: number }>(
        "/api/invoices",
        { method: "POST", body: JSON.stringify({ source, periodYear: year, periodMonth: month }) },
      );
      toast({
        title: `Invoice generated`,
        description: `${r.alarmCount} alarms · ${fmtMoney(r.totalAmount)}`,
        variant: "success",
      });
      onOpenChange(false);
      onGenerated?.();
    } catch (e: unknown) {
      toast({ title: "Generate failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No alarm sources yet. Create an alarm first; the source name then becomes invoiceable.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <Label>Source</Label>
                <Select value={source} onChange={(e) => setSource(e.target.value)}>
                  {sources.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Month</Label>
                  <Select value={String(month)} onChange={(e) => setMonth(Number.parseInt(e.target.value, 10))}>
                    {months.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Year</Label>
                  <Select value={String(year)} onChange={(e) => setYear(Number.parseInt(e.target.value, 10))}>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </Select>
                </div>
              </div>
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                Configured rate for <strong>{source}</strong>:{" "}
                {configuredRate !== null && configuredRate > 0 ? (
                  <strong>{fmtMoney(configuredRate)}/alarm</strong>
                ) : (
                  <span className="text-amber-600">no rate set — invoice total will be $0.00. Set it via Manage rates first.</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Regenerating an existing invoice for the same source + month replaces it (snapshot is rebuilt with current alarms).
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={onSubmit} disabled={submitting || sources.length === 0}>
            {submitting ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Manage per-source rates dialog
// -----------------------------------------------------------------------------

function ManageRatesDialog({
  open,
  onOpenChange,
  sources,
  rates,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sources: string[];
  rates: RateRow[];
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [values, setValues] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    for (const s of sources) {
      const slug = s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const r = rates.find((x) => x.slug === slug);
      initial[s] = r ? r.rate.toFixed(2) : "0.00";
    }
    setValues(initial);
  }, [open, sources, rates]);

  async function onSave(source: string) {
    const v = Number.parseFloat(values[source] ?? "0");
    if (!Number.isFinite(v) || v < 0) {
      toast({ title: "Invalid rate", variant: "error" });
      return;
    }
    try {
      await api("/api/invoices", {
        method: "PATCH",
        body: JSON.stringify({ source, rate: v }),
      });
      toast({ title: `Saved ${source}: ${fmtMoney(v)}/alarm`, variant: "success" });
      onSaved?.();
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Per-source rates</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sources yet — they appear here after you create alarms.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Flat fee per alarm, billed at invoice generation. Changes apply to new invoices; existing invoices keep the rate they were generated with.
              </p>
              {sources.map((s) => (
                <div key={s} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">{s}</Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-2 border border-r-0 rounded-l-md bg-muted text-sm text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={values[s] ?? ""}
                        onChange={(e) => setValues((prev) => ({ ...prev, [s]: e.target.value }))}
                        className="rounded-l-none"
                      />
                    </div>
                  </div>
                  <Button type="button" size="sm" onClick={() => onSave(s)}>Save</Button>
                </div>
              ))}
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
