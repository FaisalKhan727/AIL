"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface PromptSpec {
  title: string;
  description?: string;
  placeholder?: string;
  confirm: string;
  required?: boolean;
  destructive?: boolean;
  onSubmit: (text: string) => Promise<boolean>;
}

/** One-field dialog for "add a note", "resolve with outcome" and the like. */
export function PromptDialog({ spec, onClose }: { spec: PromptSpec | null; onClose: () => void }) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setText(""); setBusy(false); }, [spec]);
  return (
    <Dialog open={Boolean(spec)} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        {spec && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              if (await spec.onSubmit(text.trim())) onClose(); else setBusy(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>{spec.title}</DialogTitle>
              {spec.description && <DialogDescription>{spec.description}</DialogDescription>}
            </DialogHeader>
            <Textarea rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={spec.placeholder} required={spec.required} />
            <DialogFooter className="dialog-footer-sticky">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant={spec.destructive ? "destructive" : "default"} disabled={busy}>{busy ? "Saving…" : spec.confirm}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
