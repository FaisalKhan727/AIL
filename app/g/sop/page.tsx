"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface PendingItem {
  companyId: string;
  companyName: string;
  guardId: string;
  sop: { id: string; title: string; body: string; version: number };
}

/**
 * Full-screen re-acknowledgement flow. Lists every SOP awaiting
 * acknowledgement (one per company the guard belongs to) and walks the
 * guard through each in turn. The banner from the layout routes here
 * whenever GET /api/g/sop/pending returns a non-empty list.
 */
export default function ReackPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [acked, setAcked] = React.useState(false);

  const { data, isLoading } = useQuery<{ pending: PendingItem[] }>({
    queryKey: ["g-sop-pending"],
    queryFn: async () => {
      const r = await fetch("/api/g/sop/pending");
      if (!r.ok) throw new Error("Failed to load pending SOPs");
      return r.json();
    },
  });

  const pending = data?.pending ?? [];
  // Always work on the head — once the guard acks it, the query refetches
  // and the next item shifts in (or the list empties and we redirect home).
  const current = pending[0];

  React.useEffect(() => {
    if (!isLoading && pending.length === 0) {
      router.replace("/g");
    }
  }, [isLoading, pending.length, router]);

  async function acknowledge() {
    if (!current || !acked || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/g/sop/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: current.companyId,
          sopVersionId: current.sop.id,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Acknowledge failed");
      }
      toast({ title: "Acknowledged — thanks", variant: "success" });
      setAcked(false);
      await qc.invalidateQueries({ queryKey: ["g-sop-pending"] });
    } catch (e: unknown) {
      toast({
        title: "Could not acknowledge",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }
  if (!current) return null;

  // Paragraphs split on blank lines, same convention as the contract PDF.
  const paragraphs = current.sop.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="max-w-md mx-auto px-4 pb-32 pt-6">
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3 mb-4">
        <AlertCircle className="h-5 w-5 text-amber-700 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-amber-900">
          <p className="font-semibold">{current.companyName} has updated their SOP.</p>
          <p className="mt-0.5">Read the new version below and acknowledge to continue using the app.</p>
        </div>
      </div>

      <h1 className="text-xl font-bold text-slate-900">{current.sop.title}</h1>
      <p className="text-xs text-slate-500 mb-3">Version {current.sop.version} · {current.companyName}</p>

      <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-4 mb-4">
        {paragraphs.length === 0 ? (
          <p className="text-sm text-slate-500">No SOP body provided.</p>
        ) : (
          paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-slate-700 whitespace-pre-wrap">{p}</p>
          ))
        )}
      </div>

      {pending.length > 1 && (
        <p className="text-xs text-slate-500 text-center mb-3">
          {pending.length - 1} more SOP{pending.length - 1 === 1 ? "" : "s"} to acknowledge after this
        </p>
      )}

      <label className="flex items-start gap-3 rounded-xl bg-white border border-slate-200 p-3 cursor-pointer mb-3">
        <input
          type="checkbox"
          checked={acked}
          onChange={(e) => setAcked(e.target.checked)}
          className="mt-0.5 h-5 w-5"
        />
        <span className="text-sm text-slate-900">
          I have read and understood the {current.sop.title} (v{current.sop.version}).
        </span>
      </label>

      <Button
        onClick={acknowledge}
        disabled={!acked || busy}
        className="w-full h-12"
      >
        <ShieldCheck className="h-5 w-5" />
        {busy ? "Acknowledging…" : "I acknowledge"}
      </Button>
    </div>
  );
}
