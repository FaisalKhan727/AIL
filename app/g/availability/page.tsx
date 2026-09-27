"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CompanyChip } from "@/components/g/company-chip";
import { Skeleton } from "@/components/g/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Membership {
  guardId: string;
  companyId: string;
  companyName: string;
  companyBrandColour: string | null;
}

interface MeResponse {
  memberships: Membership[];
}

interface AvailabilityResp {
  daysOfWeek: string[];
  notes: string;
  updatedAt: string | null;
}

const DAYS = [
  { code: "MON", label: "Mon" },
  { code: "TUE", label: "Tue" },
  { code: "WED", label: "Wed" },
  { code: "THU", label: "Thu" },
  { code: "FRI", label: "Fri" },
  { code: "SAT", label: "Sat" },
  { code: "SUN", label: "Sun" },
];

const ACTIVE_COMPANY_KEY = "vg_active_company";

export default function AvailabilityPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [company, setCompany] = React.useState<string | null>(null);
  const [days, setDays] = React.useState<Set<string>>(new Set());
  const [notes, setNotes] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/g/me");
        if (res.status === 401) {
          router.replace("/g/sign-in");
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as MeResponse;
        setMe(json);
        if (json.memberships.length === 0) return;
        const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_COMPANY_KEY) : null;
        const initial =
          stored && json.memberships.some((m) => m.companyId === stored)
            ? stored
            : json.memberships[0].companyId;
        setCompany(initial);
      } catch {
        /* swallow */
      }
    })();
  }, [router]);

  React.useEffect(() => {
    if (!company) return;
    setLoaded(false);
    (async () => {
      try {
        const res = await fetch(`/api/g/availability?companyId=${encodeURIComponent(company)}`);
        if (!res.ok) return;
        const json = (await res.json()) as AvailabilityResp;
        setDays(new Set(json.daysOfWeek));
        setNotes(json.notes);
      } finally {
        setLoaded(true);
      }
    })();
  }, [company]);

  function toggleDay(code: string) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function save() {
    if (!company || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/g/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company, daysOfWeek: Array.from(days), notes }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      toast({ title: "Availability saved", variant: "success" });
    } catch (e: unknown) {
      toast({ title: "Could not save", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const isMultiCompany = (me?.memberships.length ?? 0) > 1;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-tabbar">
      <header className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Availability</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Let your roster manager know which days generally work for you.</p>
      </header>

      {isMultiCompany && me && (
        <div className="px-4 pt-3 pb-1 -mx-1 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex gap-2 px-1">
            {me.memberships.map((m) => (
              <CompanyChip
                key={m.companyId}
                label={m.companyName}
                colour={m.companyBrandColour}
                active={company === m.companyId}
                onClick={() => setCompany(m.companyId)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pt-4 space-y-4">
        {!loaded ? (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </>
        ) : (
          <>
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Generally available</h2>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => {
                  const active = days.has(d.code);
                  return (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => toggleDay(d.code)}
                      className={cn(
                        "h-10 w-14 rounded-lg text-sm font-medium border transition active:scale-95",
                        active
                          ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600",
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Notes</h2>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                placeholder="e.g. Not available after 6pm on weekdays, happy to cover last-minute weekend shifts…"
                className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
              />
              <div className="text-xs text-slate-400 dark:text-slate-500 text-right mt-1">{notes.length}/500</div>
            </section>

            <Button onClick={save} disabled={saving} className="w-full h-12">
              {saving ? "Saving…" : "Save availability"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
