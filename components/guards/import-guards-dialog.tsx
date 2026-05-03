"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/fetcher";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}

const SAMPLE = `firstName,lastName,phone,email,licenceNumber,licenceExpiry,payRate
Jane,Doe,+61412345678,jane@example.com,VIC-12345,2026-12-31,38.50`;

export function ImportGuardsDialog({ open, onOpenChange, onDone }: Props) {
  const [csv, setCsv] = React.useState(SAMPLE);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ createdCount: number; updatedCount: number; errorCount: number; errors: { row: number; message: string }[] } | null>(null);
  const { toast } = useToast();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
  }

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ createdCount: number; updatedCount: number; errorCount: number; errors: { row: number; message: string }[] }>(
        `/api/guards/import`,
        { method: "POST", body: JSON.stringify({ csv }) },
      );
      setResult(r);
      if (r.errorCount === 0) {
        toast({ title: `Imported ${r.createdCount} created, ${r.updatedCount} updated`, variant: "success" });
        onDone?.();
      } else {
        toast({ title: `Imported with ${r.errorCount} errors`, variant: "error" });
        onDone?.();
      }
    } catch (e: unknown) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import guards from CSV</DialogTitle>
          <DialogDescription>
            Columns: firstName, lastName, phone (E.164), email, licenceNumber, licenceExpiry (YYYY-MM-DD), payRate.
            Existing guards (matched by phone) will be updated.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input type="file" accept=".csv,text/csv" onChange={handleFile} />
          <Textarea rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} className="font-mono text-xs" />
          {result && (
            <div className="text-sm space-y-1">
              <div>Created: <span className="font-semibold">{result.createdCount}</span> · Updated: <span className="font-semibold">{result.updatedCount}</span> · Errors: <span className="font-semibold">{result.errorCount}</span></div>
              {result.errors.length > 0 && (
                <ul className="text-xs list-disc pl-5 max-h-32 overflow-y-auto text-destructive">
                  {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={submit} disabled={busy || !csv.trim()}>{busy ? "Importing…" : "Import"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
