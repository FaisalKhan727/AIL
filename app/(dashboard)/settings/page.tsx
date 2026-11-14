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
  compliance?: { nswApi: boolean; reminderJob: boolean };
}
interface Admin { id: string; email: string; name: string; role: string; createdAt: string; }

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
                ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/40">LIVE — Twilio</Badge>
                : <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/40">NOT CONFIGURED</Badge>}
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
            <CardTitle>Licence compliance</CardTitle>
            <CardDescription>How licence status affects rostering, and who gets reminded.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.compliance_block === "true"}
                onChange={(e) => setForm((f) => ({ ...f, compliance_block: e.target.checked ? "true" : "false" }))}
              />
              <span>
                <span className="font-medium">Block shifts for guards without a current, verified security licence</span>
                <span className="block text-xs text-muted-foreground">
                  When off, the roster only warns. When on, a shift can still be created with an override reason, which is recorded on the shift.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.compliance_reminders !== "false"}
                onChange={(e) => setForm((f) => ({ ...f, compliance_reminders: e.target.checked ? "true" : "false" }))}
              />
              <span>
                <span className="font-medium">Text guards before a licence expires</span>
                <span className="block text-xs text-muted-foreground">
                  Sent at 60, 30, 14 and 7 days, on the day, and a week after expiry if no renewal is on file.
                  {data?.compliance && !data.compliance.reminderJob && " The daily job isn't scheduled yet: set CRON_SECRET in the environment."}
                </span>
              </span>
            </label>
            <div className="text-xs text-muted-foreground border-t pt-3">
              NSW register lookups:{" "}
              {data?.compliance?.nswApi
                ? <span className="text-emerald-700 font-medium">connected (API NSW)</span>
                : <>not connected. Set <code>NSW_API_KEY</code> and <code>NSW_API_SECRET</code> to check NSW security licences automatically. Other states are checked by an operator against the public register.</>}
            </div>
            <Button onClick={save}>Save settings</Button>
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
          <CardHeader><CardTitle>Admin users</CardTitle><CardDescription>Only OWNER role can create new admins.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
              <TableBody>
                {admins.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono">{a.email}</TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell><Badge className={a.role === "OWNER" ? "bg-amber-500/15 text-amber-700 border-amber-500/40" : "bg-muted text-muted-foreground border-border"}>{a.role}</Badge></TableCell>
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
