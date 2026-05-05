"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Upload, Trash2 } from "lucide-react";
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
}

export default function GuardsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  // Default to active-only so soft-deleted guards (those with shift history)
  // disappear from view immediately after delete. Switch to "all" or "false"
  // to reveal deactivated guards.
  const [active, setActive] = React.useState<"all" | "true" | "false">("true");
  const [openNew, setOpenNew] = React.useState(false);
  const [openImport, setOpenImport] = React.useState(false);

  const { data: guards = [], isLoading } = useQuery<Guard[]>({
    queryKey: ["guards", q, active],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (active !== "all") params.set("active", active);
      return api(`/api/guards?${params.toString()}`);
    },
  });

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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Licence</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Pay Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && guards.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No guards yet.</TableCell></TableRow>
              )}
              {guards.map((g) => (
                <TableRow key={g.id}>
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
