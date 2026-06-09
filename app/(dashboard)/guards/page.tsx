"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Upload, Trash2, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/fetcher";
import { formatPhoneAU } from "@/lib/utils";
import { GuardFormDialog } from "@/components/guards/guard-form-dialog";
import { ImportGuardsDialog } from "@/components/guards/import-guards-dialog";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

interface Guard {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  licenceNumber: string | null;
  licenceExpiry: string | null;
  payRate: string | null;
  active: boolean;
  onboardingStatus: string;
  onboardingCompletedAt: string | null;
}

const ONBOARDING_FILTER_OPTIONS = [
  { value: "all", label: "Any onboarding" },
  { value: "NOT_STARTED", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETE", label: "Complete" },
  { value: "EXPIRED", label: "Expired" },
] as const;

function OnboardingBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    NOT_STARTED: "bg-zinc-100 text-zinc-700 border-zinc-300",
    IN_PROGRESS: "bg-amber-100 text-amber-800 border-amber-300",
    COMPLETE: "bg-emerald-100 text-emerald-800 border-emerald-300",
    EXPIRED: "bg-red-100 text-red-800 border-red-300",
  };
  const labels: Record<string, string> = {
    NOT_STARTED: "Not started",
    IN_PROGRESS: "In progress",
    COMPLETE: "Complete",
    EXPIRED: "Expired",
  };
  return (
    <Badge className={map[status] ?? "bg-zinc-100 text-zinc-700 border-zinc-300"}>
      {labels[status] ?? status}
    </Badge>
  );
}

export default function GuardsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  // Default to active-only so soft-deleted guards (those with shift history)
  // disappear from view immediately after delete. Switch to "all" or "false"
  // to reveal deactivated guards.
  const [active, setActive] = React.useState<"all" | "true" | "false">("true");
  const [onboardingFilter, setOnboardingFilter] = React.useState<typeof ONBOARDING_FILTER_OPTIONS[number]["value"]>("all");
  const [openNew, setOpenNew] = React.useState(false);
  const [openImport, setOpenImport] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = React.useState<string | null>(null);
  const [bulkSending, setBulkSending] = React.useState(false);

  const { data: guards = [], isLoading } = useQuery<Guard[]>({
    queryKey: ["guards", q, active, onboardingFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (active !== "all") params.set("active", active);
      if (onboardingFilter !== "all") params.set("onboardingStatus", onboardingFilter);
      return api(`/api/guards?${params.toString()}`);
    },
  });

  // Drop selections that are no longer in the visible list (after a filter change).
  React.useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(guards.map((g) => g.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [guards]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === guards.length) setSelected(new Set());
    else setSelected(new Set(guards.map((g) => g.id)));
  }

  async function sendOnboardingLink(g: Guard) {
    if (sendingId) return;
    setSendingId(g.id);
    try {
      await api(`/api/guards/${g.id}/send-onboarding-link`, { method: "POST" });
      toast({ title: `Onboarding link sent to ${g.firstName} ${g.lastName}`, variant: "success" });
      qc.invalidateQueries({ queryKey: ["guards"] });
    } catch (e: unknown) {
      toast({
        title: "Failed to send onboarding link",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setSendingId(null);
    }
  }

  async function bulkSendOnboarding() {
    if (selected.size === 0 || bulkSending) return;
    const ids = [...selected];
    if (!confirm(`Send onboarding link via SMS to ${ids.length} guard${ids.length === 1 ? "" : "s"}?`)) return;
    setBulkSending(true);
    try {
      const r = await api<{ sent: number; failed: Array<{ guardId: string; error: string }> }>(
        `/api/guards/onboarding/bulk-send`,
        {
          method: "POST",
          body: JSON.stringify({ guardIds: ids }),
          headers: { "Content-Type": "application/json" },
        },
      );
      if (r.failed.length === 0) {
        toast({ title: `Sent to all ${r.sent} guard${r.sent === 1 ? "" : "s"}`, variant: "success" });
      } else {
        toast({
          title: `Sent: ${r.sent} · Failed: ${r.failed.length}`,
          description: r.failed
            .slice(0, 3)
            .map((f) => `${f.guardId}: ${f.error}`)
            .join("; "),
          variant: r.sent > 0 ? "success" : "error",
        });
      }
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["guards"] });
    } catch (e: unknown) {
      toast({
        title: "Bulk send failed",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setBulkSending(false);
    }
  }

  async function deleteGuard(g: Guard) {
    if (!confirm(`Delete ${g.firstName} ${g.lastName}? Guards with shift history are kept as inactive instead of fully removed.`)) return;
    try {
      const r = await api<{ hardDeleted: boolean; shiftCount?: number }>(
        `/api/guards/${g.id}`,
        { method: "DELETE" },
      );
      toast({
        title: r.hardDeleted
          ? "Guard deleted"
          : `Guard deactivated (${r.shiftCount ?? 0} shifts in history)`,
        variant: "success",
      });
      qc.invalidateQueries({ queryKey: ["guards"] });
      qc.invalidateQueries({ queryKey: ["guard", g.id] });
    } catch (e: unknown) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  function expiryBadge(exp: string | null) {
    if (!exp) return null;
    const d = new Date(exp);
    const days = Math.floor((d.getTime() - Date.now()) / 86_400_000);
    if (days < 0) return <Badge className="bg-red-100 text-red-800 border-red-300">Expired</Badge>;
    if (days < 30) return <Badge className="bg-red-100 text-red-800 border-red-300">{days}d</Badge>;
    return <span className="text-xs text-muted-foreground">{d.toISOString().slice(0, 10)}</span>;
  }

  return (
    <>
      <PageHeader
        title="Guards"
        description={`${guards.length} guard${guards.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setOpenImport(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="h-4 w-4" /> Add Guard
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, phone, email, licence" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={active}
            onChange={(e) => setActive(e.target.value as typeof active)}
          >
            <option value="all">All</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={onboardingFilter}
            onChange={(e) => setOnboardingFilter(e.target.value as typeof onboardingFilter)}
          >
            {ONBOARDING_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="py-3 flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-amber-700" />
            <span className="text-sm font-medium text-amber-900">
              {selected.size} guard{selected.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())} disabled={bulkSending}>
              Clear
            </Button>
            <Button size="sm" onClick={bulkSendOnboarding} disabled={bulkSending}>
              {bulkSending ? "Sending…" : `Send onboarding link to ${selected.size}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Mobile: card list */}
      <div className="md:hidden space-y-2">
        {isLoading && <Card><CardContent className="py-8 text-center text-muted-foreground">Loading…</CardContent></Card>}
        {!isLoading && guards.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No guards yet.</CardContent></Card>
        )}
        {guards.map((g) => (
          <Card key={g.id}>
            <CardContent className="p-3 flex items-start gap-3">
              <input
                type="checkbox"
                aria-label={`Select ${g.firstName} ${g.lastName}`}
                checked={selected.has(g.id)}
                onChange={() => toggleSelect(g.id)}
                className="mt-1.5"
              />
              <Link href={`/guards/${g.id}`} className="flex-1 min-w-0 active:opacity-70">
                <div className="font-semibold text-base truncate">{g.firstName} {g.lastName}</div>
                <div className="text-sm font-mono text-muted-foreground truncate">{formatPhoneAU(g.phone)}</div>
                <div className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                  {g.active
                    ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Active</Badge>
                    : <Badge className="bg-zinc-100 text-zinc-700 border-zinc-300">Inactive</Badge>}
                  <OnboardingBadge status={g.onboardingStatus} />
                  {g.licenceNumber && <span className="text-muted-foreground">Lic {g.licenceNumber}</span>}
                  {g.payRate && <span className="text-muted-foreground">${Number(g.payRate).toFixed(2)}/hr</span>}
                  {expiryBadge(g.licenceExpiry)}
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Send onboarding link"
                onClick={() => sendOnboardingLink(g)}
                disabled={sendingId === g.id}
                className="text-blue-600 hover:bg-blue-50"
              >
                <ClipboardCheck className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete guard"
                onClick={() => deleteGuard(g)}
                className="text-red-600 hover:bg-red-50 -mr-1"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={guards.length > 0 && selected.size === guards.length}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Licence</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Pay Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && guards.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No guards yet.</TableCell></TableRow>
              )}
              {guards.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${g.firstName} ${g.lastName}`}
                      checked={selected.has(g.id)}
                      onChange={() => toggleSelect(g.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`/guards/${g.id}`}>
                      {g.firstName} {g.lastName}
                    </Link>
                    {g.email && <div className="text-xs text-muted-foreground">{g.email}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{formatPhoneAU(g.phone)}</TableCell>
                  <TableCell>{g.licenceNumber ?? "—"}</TableCell>
                  <TableCell>{expiryBadge(g.licenceExpiry)}</TableCell>
                  <TableCell>{g.payRate ? `$${Number(g.payRate).toFixed(2)}/hr` : "—"}</TableCell>
                  <TableCell>
                    {g.active ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Active</Badge>
                    ) : (
                      <Badge className="bg-zinc-100 text-zinc-700 border-zinc-300">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <OnboardingBadge status={g.onboardingStatus} />
                    {g.onboardingStatus === "COMPLETE" && g.onboardingCompletedAt && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(g.onboardingCompletedAt).toISOString().slice(0, 10)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Send onboarding link"
                      title={g.onboardingStatus === "COMPLETE" ? "Re-send onboarding link" : "Send onboarding link"}
                      onClick={() => sendOnboardingLink(g)}
                      disabled={sendingId === g.id}
                      className="text-blue-600 hover:bg-blue-50"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Delete guard"
                      onClick={() => deleteGuard(g)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <GuardFormDialog
        open={openNew}
        onOpenChange={setOpenNew}
        onSaved={() => qc.invalidateQueries({ queryKey: ["guards"] })}
      />
      <ImportGuardsDialog
        open={openImport}
        onOpenChange={setOpenImport}
        onDone={() => qc.invalidateQueries({ queryKey: ["guards"] })}
      />
    </>
  );
}
