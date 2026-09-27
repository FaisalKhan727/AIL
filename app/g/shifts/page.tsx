"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { CompanyChip } from "@/components/g/company-chip";
import { EmptyState } from "@/components/g/empty-state";
import {
  ShiftCardCompact,
  ShiftCardCompactSkeleton,
  type ShiftCardData,
} from "@/components/g/shift-card";

interface Membership {
  guardId: string;
  companyId: string;
  companyName: string;
  companyBrandColour: string | null;
}

interface ShiftApi {
  id: string;
  startAt: string;
  endAt: string;
  role: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "WORKED" | "NO_SHOW" | "CANCELLED";
  workedStart: string | null;
  workedEnd: string | null;
  site: { id: string; name: string; address: string };
  company: { id: string; name: string; brandColour: string | null } | null;
}

interface HomeResponse {
  identity: { firstName: string };
  memberships: Membership[];
  shifts: ShiftApi[];
}

const ACTIVE_COMPANY_KEY = "vg_active_company";

function mapShift(s: ShiftApi): ShiftCardData {
  return {
    id: s.id,
    startAt: s.startAt,
    endAt: s.endAt,
    status: s.status,
    role: s.role,
    site: s.site,
    company: s.company,
  };
}

export default function MyShiftsPage() {
  const router = useRouter();
  const [me, setMe] = React.useState<HomeResponse | null>(null);
  const [shifts, setShifts] = React.useState<ShiftApi[] | null>(null);
  const [activeCompany, setActiveCompany] = React.useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return localStorage.getItem(ACTIVE_COMPANY_KEY) || "all";
  });

  const reload = React.useCallback(async () => {
    try {
      const q = activeCompany === "all" ? "" : `?companyId=${encodeURIComponent(activeCompany)}`;
      const res = await fetch(`/api/g/home${q}`);
      if (res.status === 401) {
        router.replace("/g/sign-in");
        return;
      }
      if (!res.ok) return;
      const json = (await res.json()) as HomeResponse;
      setMe(json);
      setShifts(json.shifts);
    } catch {
      setShifts([]);
    }
  }, [activeCompany, router]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_COMPANY_KEY, activeCompany);
  }, [activeCompany]);

  async function respond(shiftId: string, action: "accept" | "reject", reason?: string) {
    const prev = shifts;
    if (shifts) {
      setShifts(shifts.map((s) => (s.id === shiftId ? { ...s, status: action === "accept" ? "CONFIRMED" : "REJECTED" } : s)));
    }
    try {
      const res = await fetch(`/api/g/shifts/${shiftId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "reject" ? JSON.stringify({ reason }) : "{}",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${action} failed`);
      await reload();
    } catch (e: unknown) {
      setShifts(prev);
      alert(e instanceof Error ? e.message : `${action} failed`);
    }
  }

  const isMultiCompany = (me?.memberships.length ?? 0) > 1;
  const sorted = React.useMemo(
    () => (shifts ? [...shifts].sort((a, b) => a.startAt.localeCompare(b.startAt)) : null),
    [shifts],
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-tabbar">
      <header className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">My Shifts</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {sorted ? `${sorted.length} shift${sorted.length === 1 ? "" : "s"}` : "Loading…"}
        </p>
      </header>

      {isMultiCompany && me && (
        <div className="px-4 pt-3 pb-1 -mx-1 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex gap-2 px-1">
            <CompanyChip label="All" colour={null} active={activeCompany === "all"} onClick={() => setActiveCompany("all")} />
            {me.memberships.map((m) => (
              <CompanyChip
                key={m.companyId}
                label={m.companyName}
                colour={m.companyBrandColour}
                active={activeCompany === m.companyId}
                onClick={() => setActiveCompany(m.companyId)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pt-4">
        {sorted === null ? (
          <ul className="space-y-2">
            <ShiftCardCompactSkeleton />
            <ShiftCardCompactSkeleton />
            <ShiftCardCompactSkeleton />
          </ul>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No shifts scheduled"
            description="We'll notify you the moment a roster is published."
          />
        ) : (
          <ul className="space-y-2">
            {sorted.map((s) => (
              <ShiftCardCompact
                key={s.id}
                shift={mapShift(s)}
                showCompanyBadge={isMultiCompany && activeCompany === "all"}
                onTap={() => router.push(`/g/shifts/${s.id}`)}
                onAccept={() => void respond(s.id, "accept")}
                onReject={() => {
                  const reason = prompt("Reject reason (optional):") ?? undefined;
                  void respond(s.id, "reject", reason);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
