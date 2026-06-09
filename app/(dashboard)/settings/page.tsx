"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";

interface SettingsResp {
  settings: Record<string, string>;
  sms: { configured: boolean; twilioSidMasked: string; twilioFromNumber: string };
}
interface Admin { id: string; email: string; name: string; role: string; createdAt: string; }
interface SopVersion {
  id: string;
  version: number;
  title: string;
  body: string;
  effectiveFrom: string;
  isCurrent: boolean;
  createdAt: string;
}
interface SopList { versions: SopVersion[]; pendingReackCount: number }

const KEYS = [
  { key: "company_name", label: "Company name", type: "text" },
  { key: "timezone", label: "Timezone", type: "text" },
  { key: "default_pay_rate", label: "Default pay rate ($/hr)", type: "number" },
  { key: "sms_template_roster", label: "Outbound roster SMS template", type: "textarea" },
  { key: "sms_template_reply_summary", label: "Auto-reply summary template", type: "textarea" },
  { key: "sms_template_unparsed", label: "Auto-reply for unparsed replies", type: "textarea" },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery<SettingsResp>({ queryKey: ["settings"], queryFn: () => api(`/api/settings`) });
  const { data: admins = [] } = useQuery<Admin[]>({ queryKey: ["admins"], queryFn: () => api(`/api/admins`) });
  const { data: sopList } = useQuery<SopList>({ queryKey: ["sop"], queryFn: () => api(`/api/sop`) });

  const [sopDraft, setSopDraft] = React.useState({ title: "", body: "" });
  const [sopPublishing, setSopPublishing] = React.useState(false);
  const currentSop = sopList?.versions.find((v) => v.isCurrent) ?? null;

  async function publishSop() {
    if (sopPublishing) return;
    const completedReackText = sopList && sopList.pendingReackCount > 0
      ? `\n\n${sopList.pendingReackCount} guard${sopList.pendingReackCount === 1 ? "" : "s"} who already completed onboarding will be flagged to re-acknowledge.`
      : "";
    if (!confirm(`Publish "${sopDraft.title}" as the new SOP?${completedReackText}\n\nThis cannot be undone.`)) return;
    setSopPublishing(true);
    try {
      await api(`/api/sop`, { method: "POST", body: JSON.stringify(sopDraft) });
      toast({ title: "New SOP version published — guards will be prompted to re-acknowledge", variant: "success" });
      setSopDraft({ title: "", body: "" });
      qc.invalidateQueries({ queryKey: ["sop"] });
    } catch (e: unknown) {
      toast({ title: "Publish failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setSopPublishing(false);
    }
  }

  const [form, setForm] = React.useState<Record<string, string>>({});
  React.useEffect(() => { if (data?.settings) setForm(data.settings); }, [data]);

  const [newAdmin, setNewAdmin] = React.useState({ email: "", name: "", password: "", role: "MANAGER" });

  async function save() {
    try {
      await api(`/api/settings`, { method: "PATCH", body: JSON.stringify(form) });
      toast({ title: "Settings saved", variant: "success" });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  async function createAdmin() {
    try {
      await api(`/api/admins`, { method: "POST", body: JSON.stringify(newAdmin) });
      setNewAdmin({ email: "", name: "", password: "", role: "MANAGER" });
      toast({ title: "Admin created", variant: "success" });
      qc.invalidateQueries({ queryKey: ["admins"] });
    } catch (e: unknown) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  }

  return (
    <>
      <PageHeader title="Settings" description="Company, SMS templates, provider, and admin users." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle>SMS Provider</CardTitle>
              {data?.sms.configured
                ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">LIVE — Twilio</Badge>
                : <Badge className="bg-rose-100 text-rose-800 border-rose-300">NOT CONFIGURED</Badge>}
            </div>
            <CardDescription>Outbound and inbound SMS run through Twilio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <div><span className="text-muted-foreground">SID:</span> <span className="font-mono">{data?.sms.twilioSidMasked || "—"}</span></div>
              <div><span className="text-muted-foreground">From:</span> <span className="font-mono">{data?.sms.twilioFromNumber || "—"}</span></div>
            </div>
            {!data?.sms.configured && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded p-3 space-y-1">
                <p><strong>Twilio credentials are missing.</strong></p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Set <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, <code>TWILIO_FROM_NUMBER</code> in the environment.</li>
                  <li>Set <code>PUBLIC_BASE_URL</code> to your live HTTPS origin (e.g. <code>https://roster.example.com</code>).</li>
                  <li>In Twilio Console, point your number&apos;s messaging webhook to <code>/api/sms/webhook</code> (POST) and the status callback to <code>/api/sms/status</code>.</li>
                </ol>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Company</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {KEYS.filter((k) => !k.key.startsWith("sms_template")).map((k) => (
              <div className="space-y-1" key={k.key}>
                <Label>{k.label}</Label>
                <Input
                  type={k.type}
                  value={form[k.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [k.key]: e.target.value }))}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>SMS templates</CardTitle>
            <CardDescription>
              Placeholders: <code>{`{firstName}`}</code>, <code>{`{rosterName}`}</code>, <code>{`{shiftList}`}</code>,
              <code>{`{firstConfirmCode}`}</code>, <code>{`{confirmedCount}`}</code>, <code>{`{rejectedCount}`}</code>, <code>{`{pendingCount}`}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {KEYS.filter((k) => k.key.startsWith("sms_template")).map((k) => (
              <div className="space-y-1" key={k.key}>
                <Label>{k.label}</Label>
                <Textarea rows={6} value={form[k.key] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k.key]: e.target.value }))} />
              </div>
            ))}
            <Button onClick={save}>Save settings</Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle>Standard Operating Procedure</CardTitle>
              {currentSop ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                  Current: v{currentSop.version}
                </Badge>
              ) : (
                <Badge className="bg-rose-100 text-rose-800 border-rose-300">NO SOP PUBLISHED</Badge>
              )}
            </div>
            <CardDescription>
              The SOP is acknowledged by every guard during onboarding. Publishing a new version
              requires all completed guards to re-acknowledge before they can continue using the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentSop && (
              <div className="text-sm space-y-2 bg-muted/30 rounded-lg p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{currentSop.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Published {new Date(currentSop.createdAt).toISOString().slice(0, 10)}
                  </div>
                </div>
                <div className="whitespace-pre-wrap text-xs text-muted-foreground max-h-48 overflow-y-auto">
                  {currentSop.body}
                </div>
                {sopList && sopList.pendingReackCount > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    {sopList.pendingReackCount} guard{sopList.pendingReackCount === 1 ? "" : "s"} pending re-acknowledgement
                  </div>
                )}
              </div>
            )}

            {sopList && sopList.versions.length > 1 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Previous versions ({sopList.versions.length - 1})</summary>
                <ul className="mt-2 space-y-1 pl-3">
                  {sopList.versions.filter((v) => !v.isCurrent).map((v) => (
                    <li key={v.id}>
                      v{v.version} — {v.title} — {new Date(v.createdAt).toISOString().slice(0, 10)}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="border-t pt-4 space-y-3">
              <div className="text-sm font-semibold">Publish a new version</div>
              <div className="space-y-1">
                <Label>Title</Label>
                <Input
                  value={sopDraft.title}
                  onChange={(e) => setSopDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="e.g. Field Operations SOP"
                />
              </div>
              <div className="space-y-1">
                <Label>SOP body</Label>
                <Textarea
                  rows={10}
                  value={sopDraft.body}
                  onChange={(e) => setSopDraft((d) => ({ ...d, body: e.target.value }))}
                  placeholder="Section 1: Reporting on shift...&#10;&#10;Section 2: Site protocols..."
                />
                <div className="text-xs text-muted-foreground">
                  Plain text. Blank lines separate paragraphs. Render is read-only on the guard side.
                </div>
              </div>
              <Button
                onClick={publishSop}
                disabled={sopPublishing || sopDraft.title.trim().length < 2 || sopDraft.body.trim().length < 20}
              >
                {sopPublishing ? "Publishing…" : "Publish as v" + ((sopList?.versions[0]?.version ?? 0) + 1)}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Admin users</CardTitle><CardDescription>Only OWNER role can create new admins.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
              <TableBody>
                {admins.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono">{a.email}</TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell><Badge className={a.role === "OWNER" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-slate-100 text-slate-800 border-slate-300"}>{a.role}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(a.createdAt).toISOString().slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div className="space-y-1"><Label>Email</Label><Input type="email" value={newAdmin.email} onChange={(e) => setNewAdmin((x) => ({ ...x, email: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Name</Label><Input value={newAdmin.name} onChange={(e) => setNewAdmin((x) => ({ ...x, name: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Password (8+)</Label><Input type="password" value={newAdmin.password} onChange={(e) => setNewAdmin((x) => ({ ...x, password: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Role</Label>
                <Select value={newAdmin.role} onChange={(e) => setNewAdmin((x) => ({ ...x, role: e.target.value }))}>
                  <option value="MANAGER">MANAGER</option><option value="OWNER">OWNER</option>
                </Select>
              </div>
              <Button onClick={createAdmin}>Add admin</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
