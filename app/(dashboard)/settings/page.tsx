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
  sms: { mode: "mock" | "twilio"; twilioSidMasked: string; twilioFromNumber: string };
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
              {data?.sms.mode === "twilio"
                ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">LIVE — Twilio</Badge>
                : <Badge className="bg-amber-100 text-amber-800 border-amber-300">MOCK MODE</Badge>}
            </div>
            <CardDescription>Outbound and inbound SMS use the configured provider.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <div><span className="text-muted-foreground">SID:</span> <span className="font-mono">{data?.sms.twilioSidMasked || "—"}</span></div>
              <div><span className="text-muted-foreground">From:</span> <span className="font-mono">{data?.sms.twilioFromNumber || "—"}</span></div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-3 space-y-1">
              <p><strong>To switch to live SMS:</strong></p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>In <code>.env</code>, set <code>SMS_MODE=twilio</code></li>
                <li>Set <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, <code>TWILIO_FROM_NUMBER</code></li>
                <li>Implement the TODOs in <code>lib/sms/twilio-adapter.ts</code></li>
                <li>Restart the server. This badge will switch to <em>LIVE — Twilio</em>.</li>
              </ol>
            </div>
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
