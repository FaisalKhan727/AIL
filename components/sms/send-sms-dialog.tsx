"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";

interface GuardOption {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const MAX_LEN = 480;

export function SendSmsDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [guardId, setGuardId] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const { data: guards } = useQuery<GuardOption[]>({
    queryKey: ["guards", "active-for-sms"],
    queryFn: () => api(`/api/guards?active=true`),
    enabled: open,
  });

  React.useEffect(() => {
    if (!open) {
      setGuardId("");
      setMessage("");
    }
  }, [open]);

  async function handleSend() {
    if (!guardId || !message.trim()) return;
    setSending(true);
    try {
      await api(`/api/sms/send`, { method: "POST", body: JSON.stringify({ guardId, message: message.trim() }) });
      toast({ title: "Message sent" });
      qc.invalidateQueries({ queryKey: ["sms-log"] });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Send failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send SMS</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sms-guard">Guard</Label>
            <Select id="sms-guard" value={guardId} onChange={(e) => setGuardId(e.target.value)}>
              <option value="">Select a guard…</option>
              {(guards ?? []).map((g) => (
                <option key={g.id} value={g.id}>{g.firstName} {g.lastName} · {g.phone}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sms-message">Message</Label>
            <Textarea
              id="sms-message"
              rows={4}
              maxLength={MAX_LEN}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message to send directly to this guard's phone…"
            />
            <div className="text-xs text-muted-foreground text-right">{message.length}/{MAX_LEN}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !guardId || !message.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
