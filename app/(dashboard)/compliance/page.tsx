"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { LICENCE_TYPES, STATUS_LABEL, type ComplianceIssue, type LicenceStatus } from "@/lib/licences";
import { LicenceStatusBadge, auDate, daysLabel } from "@/components/compliance/licence-status";
import { LicenceFormDialog, type LicenceFormInitial } from "@/components/compliance/licence-form-dialog";
import { VerifyDialog } from "@/components/compliance/verify-dialog";

interface LicenceRow {
  id: string;
  guardId: string;
  guardName: string;
  guardActive: boolean;
  type: string;
  typeShort: string;
  typeLabel: string;
  number: string;
  state: string;
  issueDate: string | null;
  expiryDate: string | null;
  daysLeft: number | null;
  status: LicenceStatus;
  source: string;
  verifiedBy: string | null;
  verifyMethod: string | null;
  document: { name: string } | null;
}
interface GuardLevel { id: string; name: string; level: "ok" | "warn" | "block"; issues: ComplianceIssue[] }
interface Resp {
  licences: LicenceRow[];
  guards: GuardLevel[];
  stats: {
    total: number; valid: number; expiring: number; urgent: number; expired: number; unverified: number; rejected: number;
    guardsTotal: number; guardsCompliant: number; score: number;
  };
}

type Tab = "queue" | "registry" | "guards";
const PAGE = 15;

function Stat({ label, value, tone, active, onClick }: { label: string; value: number; tone?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[10px] border bg-card p-3.5 text-left transition-colors hover:bg-muted/40",
        active && "border-primary bg-primary/10",
      )}
    >
      <div className="eyebrow truncate">{label}</div>
      <div className={cn("num font-display mt-1.5 text-2xl font-bold leading-none", value > 0 && tone)}>{value}</div>
    </button>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
      <span className="num">Page {page + 1} of {pages}</span>
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>Prev</Button>
      <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}

export default function CompliancePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Resp>({ queryKey: ["licences"], queryFn: () => api(`/api/licences`), refetchInterval: 20_000 });

  const [tab, setTab] = React.useState<Tab>("queue");
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState("");
  const [status, setStatus] = React.useState<"" | LicenceStatus>("");
  const [page, setPage] = React.useState(0);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LicenceFormInitial | undefined>();
  const [verifyId, setVerifyId] = React.useState<string | null>(null);

  // With nothing waiting, the queue tab is just an empty state. Land on the
  // registry instead (once, when the first response arrives).
  const landed = React.useRef(false);
  React.useEffect(() => {
    if (!data || landed.current) return;
    landed.current = true;
    if (data.stats.unverified === 0) setTab("registry");
  }, [data]);

  React.useEffect(() => { setPage(0); }, [tab, q, type, status]);

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["licences"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["guards"] });
  }, [qc]);

  const licences = data?.licences ?? [];
  const queue = licences.filter((l) => l.status === "UNVERIFIED" && l.guardActive);
  const needle = q.trim().toLowerCase();
  const filtered = licences.filter(
    (l) =>
      (!type || l.type === type) &&
      (!status || l.status === status) &&
      (!needle || l.guardName.toLowerCase().includes(needle) || l.number.toLowerCase().includes(needle)),
  );
  const rows = tab === "queue" ? queue : filtered;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const view = rows.slice(current * PAGE, current * PAGE + PAGE);

  function pickStatus(s: LicenceStatus) {
    setTab("registry");
    setStatus((prev) => (prev === s ? "" : s));
  }

  async function remove(l: LicenceRow) {
    if (!confirm(`Delete ${l.typeShort} ${l.number} for ${l.guardName}? Its verification history is deleted too.`)) return;
    try {
      await api(`/api/licences/${l.id}`, { method: "DELETE" });
      toast({ title: "Licence deleted", variant: "success" });
      refresh();
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  const s = data?.stats;
  const guardOptions = (data?.guards ?? []).map((g) => ({ id: g.id, name: g.name }));
  const attention = (data?.guards ?? []).filter((g) => g.level !== "ok");

  return (
    <>
      <PageHeader
        title="Licences & Compliance"
        description="Every credential your guards hold, who checked it, and when it runs out."
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api/licences/export" download><Download className="h-4 w-4" /> Export CSV</a>
            </Button>
            <Button onClick={() => { setEditing(undefined); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add licence</Button>
          </>
        }
      />

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {s && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-[1.6fr_repeat(5,1fr)]">
            <Card className="col-span-2 sm:col-span-3 xl:col-span-1">
              <CardContent className="!p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="eyebrow">Guards cleared to work</span>
                  <span className="num text-xs text-muted-foreground">{s.guardsCompliant} of {s.guardsTotal}</span>
                </div>
                <div className="mt-1.5 flex items-end gap-3">
                  <span className={cn("num font-display text-2xl font-bold leading-none", s.score < 100 ? "text-warning" : "text-success")}>{s.score}%</span>
                  <div className="mb-1 h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${s.score}% of guards hold a current, verified security licence`}>
                    <div className={cn("h-full rounded-full", s.score < 100 ? "bg-warning" : "bg-success")} style={{ width: `${s.score}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Stat label="Valid" value={s.valid} tone="text-success" active={status === "VALID"} onClick={() => pickStatus("VALID")} />
            <Stat label="Expiring ≤ 60 days" value={s.expiring} tone="text-warning" active={status === "EXPIRING"} onClick={() => pickStatus("EXPIRING")} />
            <Stat label="Urgent ≤ 14 days" value={s.urgent} tone="text-red-400" active={status === "URGENT"} onClick={() => pickStatus("URGENT")} />
            <Stat label="Expired" value={s.expired} tone="text-critical" active={status === "EXPIRED"} onClick={() => pickStatus("EXPIRED")} />
            <Stat label="To verify" value={s.unverified} tone="text-sky-300" active={tab === "queue"} onClick={() => setTab("queue")} />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-2 border-b">
            {([
              ["queue", `Verification queue`, queue.length],
              ["registry", "Registry", licences.length],
              ["guards", "Guard clearance", attention.length],
            ] as [Tab, string, number][]).map(([key, label, n]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm",
                  tab === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                <span className={cn("num rounded px-1.5 text-[10.5px] leading-4", key === "queue" && n > 0 ? "bg-sky-500/20 text-sky-300" : "bg-muted text-muted-foreground")}>{n}</span>
              </button>
            ))}
          </div>

          {tab === "registry" && (
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_14rem_12rem]">
              <Input placeholder="Search guard or licence number" value={q} onChange={(e) => setQ(e.target.value)} />
              <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Credential type">
                <option value="">All credentials</option>
                {LICENCE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.short}</option>)}
              </Select>
              <Select value={status} onChange={(e) => setStatus(e.target.value as "" | LicenceStatus)} aria-label="Status">
                <option value="">All statuses</option>
                {(Object.keys(STATUS_LABEL) as LicenceStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
              </Select>
            </div>
          )}

          {tab !== "guards" && (
            <Card>
              <CardContent className="!p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Guard</TableHead>
                    <TableHead>Credential</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>{tab === "queue" ? "Source" : "Verified"}</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {view.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        {tab === "queue"
                          ? "Nothing waiting. New uploads from the guard app appear here."
                          : licences.length === 0 ? "No licences recorded yet. Add one, or ask guards to upload theirs from the app." : "No licences match these filters."}
                      </TableCell></TableRow>
                    )}
                    {view.map((l) => (
                      <TableRow key={l.id} className={cn(!l.guardActive && "opacity-55")}>
                        <TableCell>
                          <Link href={`/guards/${l.guardId}`} className="font-medium hover:underline">{l.guardName}</Link>
                          {!l.guardActive && <span className="ml-1.5 text-xs text-muted-foreground">(inactive)</span>}
                        </TableCell>
                        <TableCell title={l.typeLabel}>{l.typeShort}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {l.number} <span className="text-muted-foreground">{l.state}</span>
                          {l.document && <Paperclip className="ml-1.5 inline h-3 w-3 text-muted-foreground" aria-label="Document on file" />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="num text-[13px]">{auDate(l.expiryDate)}</span>
                          {l.daysLeft !== null && l.daysLeft <= 60 && (
                            <span className={cn("ml-2 text-xs", l.daysLeft < 0 ? "text-red-300" : l.daysLeft <= 14 ? "text-red-300" : "text-amber-300")}>{daysLabel(l.daysLeft)}</span>
                          )}
                        </TableCell>
                        <TableCell><LicenceStatusBadge status={l.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {tab === "queue"
                            ? { GUARD: "Guard app upload", ADMIN: "Office entry", IMPORT: "Guard record" }[l.source] ?? l.source
                            : l.verifiedBy
                              ? <>{l.verifiedBy} <span className="font-mono uppercase">· {l.verifyMethod === "API" ? "API" : l.verifyMethod === "REGISTER" ? "Register" : "Sighted"}</span></>
                              : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant={l.status === "UNVERIFIED" ? "default" : "outline"} onClick={() => setVerifyId(l.id)}>
                              {l.status === "UNVERIFIED" ? "Review" : "Open"}
                            </Button>
                            <Button size="sm" variant="ghost" className="px-2" aria-label="Edit licence" onClick={() => { setEditing(l); setFormOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="px-2 text-red-300" aria-label="Delete licence" onClick={() => remove(l)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pager page={current} pages={pages} onPage={setPage} />
              </CardContent>
            </Card>
          )}

          {tab === "guards" && (
            <Card>
              <CardContent className="!p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Guard</TableHead><TableHead>Rostering</TableHead><TableHead>What needs doing</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(data?.guards ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={3} className="py-10 text-center text-muted-foreground">No active guards.</TableCell></TableRow>
                    )}
                    {[...(data?.guards ?? [])]
                      .sort((a, b) => "block warn ok".indexOf(a.level) - "block warn ok".indexOf(b.level))
                      .map((g) => (
                        <TableRow key={g.id}>
                          <TableCell><Link href={`/guards/${g.id}`} className="font-medium hover:underline">{g.name}</Link></TableCell>
                          <TableCell>
                            {g.level === "block" && <Badge className="bg-red-500/15 text-red-300 border-red-500/40">Not cleared</Badge>}
                            {g.level === "warn" && <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/40">Cleared · attention</Badge>}
                            {g.level === "ok" && <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40">Cleared</Badge>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {g.issues.length === 0 ? "—" : g.issues.map((i) => i.message).join(" · ")}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <LicenceFormDialog open={formOpen} onOpenChange={setFormOpen} guards={guardOptions} initial={editing} onSaved={refresh} />
      <VerifyDialog licenceId={verifyId} onClose={() => setVerifyId(null)} onDone={refresh} />
    </>
  );
}
