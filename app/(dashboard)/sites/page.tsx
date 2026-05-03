"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SiteFormDialog } from "@/components/sites/site-form-dialog";
import { api } from "@/lib/fetcher";

interface Site {
  id: string;
  name: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  active: boolean;
}

export default function SitesPage() {
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const { data: sites = [], isLoading } = useQuery<Site[]>({
    queryKey: ["sites", q],
    queryFn: () => api(`/api/sites?${q ? `q=${encodeURIComponent(q)}` : ""}`),
  });
  return (
    <>
      <PageHeader title="Sites" description={`${sites.length} site${sites.length === 1 ? "" : "s"}`} actions={
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Site</Button>
      } />
      <Card className="mb-4"><CardContent className="pt-6">
        <div className="relative max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search name or address" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Address</TableHead><TableHead>Contact</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && sites.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No sites yet.</TableCell></TableRow>}
            {sites.map((s) => (
              <TableRow key={s.id}>
                <TableCell><Link href={`/sites/${s.id}`} className="font-medium hover:underline">{s.name}</Link></TableCell>
                <TableCell className="text-sm">{s.address}</TableCell>
                <TableCell className="text-sm">{s.contactName ? `${s.contactName}${s.contactPhone ? ` · ${s.contactPhone}` : ""}` : "—"}</TableCell>
                <TableCell>
                  {s.active
                    ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Active</Badge>
                    : <Badge className="bg-zinc-100 text-zinc-700 border-zinc-300">Inactive</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <SiteFormDialog open={open} onOpenChange={setOpen} onSaved={() => qc.invalidateQueries({ queryKey: ["sites"] })} />
    </>
  );
}
