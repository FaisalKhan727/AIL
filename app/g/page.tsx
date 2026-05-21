"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CompanyChip } from "@/components/g/company-chip";
import { EmptyState } from "@/components/g/empty-state";
import {
  ShiftCardHero,
  ShiftCardCompact,
  ShiftCardHeroSkeleton,
  ShiftCardCompactSkeleton,
  type ShiftCardData,
} from "@/components/g/shift-card";

// -----------------------------------------------------------------------------
// API types
// -----------------------------------------------------------------------------

interface Membership {
  guardId: string;
  companyId: string;
  companyName: string;
  companyBrandColour: string | null;
}

interface MeResponse {
  identity: { id: string; firstName: string; lastName: string; phone: string };
  memberships: Membership[];
  vapidPublicKey: string;
}

interface ShiftApi {
  id: string;
  startAt: string;
  endAt: string;
  role: string | null;
  notes: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "WORKED" | "NO_SHOW" | "CANCELLED";
  workedStart: string | null;
  workedEnd: string | null;
  site: { id: string; name: string; address: string };
  rosterName: string;
  company: { id: string; name: string; brandColour: string | null } | null;
}

interface HomeResponse {
  identity: { id: string; firstName: string; lastName: string; phone: string };
  memberships: Membership[];
  vapidPublicKey: string;
  shifts: ShiftApi[];
}

const ACTIVE_COMPANY_KEY = "vg_active_company";

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function GuardHomePage() {
  const router = useRouter();
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [shifts, setShifts] = React.useState<ShiftApi[] | null>(null);
  // Lazy init from localStorage so we fetch with the right scope on first
  // render — avoids a double-fetch (all → user's stored company).
  const [activeCompany, setActiveCompany] = React.useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return localStorage.getItem(ACTIVE_COMPANY_KEY) || "all";
  });
  const [pushState, setPushState] = React.useState<
    "unknown" | "subscribed" | "denied" | "unsupported" | "needs_permission"
  >("unknown");
  const [pushDebug, setPushDebug] = React.useState<string | null>(null);
  const swRegRef = React.useRef<ServiceWorkerRegistration | null>(null);

  // 1. Single round-trip: /api/g/home returns identity + memberships +
  //    shifts + vapidPublicKey. Replaces the previous /me → /shifts
  //    cascade (2 round-trips became 1; on a cold-start Vercel function
  //    that's ~600-1000ms saved on first open).
  //
  //    Re-fetches whenever activeCompany changes so the chip switcher
  //    re-scopes the shift list on the server (cheap, since this is
  //    after warm-up).
  const reloadHome = React.useCallback(async () => {
    try {
      const q = activeCompany === "all" ? "" : `?companyId=${encodeURIComponent(activeCompany)}`;
      const res = await fetch(`/api/g/home${q}`);
      if (res.status === 401) {
        router.replace("/g/sign-in");
        return;
      }
      if (!res.ok) return;
      const json = (await res.json()) as HomeResponse;
      setMe({
        identity: json.identity,
        memberships: json.memberships,
        vapidPublicKey: json.vapidPublicKey,
      });
      setShifts(json.shifts);
      // If stored active company is no longer a membership (e.g., admin
      // removed the guard from a company), drop back to a sane default.
      if (
        activeCompany !== "all" &&
        !json.memberships.some((m) => m.companyId === activeCompany)
      ) {
        setActiveCompany(json.memberships.length === 1 ? json.memberships[0].companyId : "all");
      }
    } catch {
      /* swallow — page sits in skeleton state */
    }
  }, [activeCompany, router]);

  React.useEffect(() => {
    void reloadHome();
  }, [reloadHome]);

  // Alias kept for the existing accept/reject handlers below that call
  // reloadShifts() — same purpose, just refreshes everything now.
  const reloadShifts = reloadHome;

  // 3. Persist active company.
  React.useEffect(() => {
    if (me && typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_COMPANY_KEY, activeCompany);
    }
  }, [me, activeCompany]);

  // 4. Service worker registration + permission inspection (no auto-prompt).
  const subscribeAndPost = React.useCallback(
    async (reg: ServiceWorkerRegistration) => {
      if (!me?.vapidPublicKey) throw new Error("vapidPublicKey missing");
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(me.vapidPublicKey),
        });
      }
      const subJson = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const subRes = await fetch("/api/g/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          deviceLabel: navigator.userAgent.slice(0, 80),
        }),
      });
      if (!subRes.ok) {
        const body = await subRes.text();
        throw new Error(`POST /api/g/push/subscribe ${subRes.status}: ${body}`);
      }
    },
    [me],
  );

  const enablePush = React.useCallback(async () => {
    setPushDebug(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("denied");
        setPushDebug(
          permission === "denied"
            ? "You blocked notifications. Open iOS Settings → Notifications → Vigilo Guards to re-enable."
            : `Permission state: ${permission}.`,
        );
        return;
      }
      const reg = swRegRef.current ?? (await navigator.serviceWorker.ready);
      await subscribeAndPost(reg);
      setPushState("subscribed");
    } catch (err) {
      setPushState("denied");
      setPushDebug(err instanceof Error ? err.message : String(err));
      console.error("[guard PWA] enablePush failed:", err);
    }
  }, [subscribeAndPost]);

  React.useEffect(() => {
    if (!me || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      setPushDebug("Browser lacks serviceWorker or PushManager.");
      return;
    }
    if (!me.vapidPublicKey) {
      setPushState("denied");
      setPushDebug("Server returned no VAPID public key — env var missing on server.");
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/g/sw.js", { scope: "/g" });
        swRegRef.current = reg;
        const perm = Notification.permission;
        if (perm === "granted") {
          await subscribeAndPost(reg);
          setPushState("subscribed");
        } else if (perm === "denied") {
          setPushState("denied");
          setPushDebug("Notifications are blocked. Open iOS Settings → Notifications → Vigilo Guards.");
        } else {
          setPushState("needs_permission");
        }
      } catch (err) {
        setPushState("denied");
        setPushDebug(err instanceof Error ? err.message : String(err));
        console.error("[guard PWA] init failed:", err);
      }
    })();
  }, [me, subscribeAndPost]);

  // 5. Respond actions (Accept/Reject) — optimistic UI update + real API call.
  async function respond(shiftId: string, action: "accept" | "reject", reason?: string) {
    const prev = shifts;
    // Optimistic: flip status immediately so the user gets instant feedback.
    if (shifts) {
      setShifts(
        shifts.map((s) =>
          s.id === shiftId ? { ...s, status: action === "accept" ? "CONFIRMED" : "REJECTED" } : s,
        ),
      );
    }
    try {
      const res = await fetch(`/api/g/shifts/${shiftId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "reject" ? JSON.stringify({ reason }) : "{}",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${action} failed`);
      await reloadShifts(); // resync from server
    } catch (e: unknown) {
      // Roll back optimistic change
      setShifts(prev);
      alert(e instanceof Error ? e.message : `${action} failed`);
    }
  }

  async function signOut() {
    if (!confirm("Sign out of Vigilo Guards?")) return;
    await fetch("/api/g/auth/sign-out", { method: "POST" });
    router.replace("/g/sign-in");
  }

  // Clock in / out. Tries to capture GPS but never blocks on it — works
  // even when location permission is denied. Optimistic UI flip then
  // server reconcile via reloadHome.
  async function clockAction(shiftId: string, action: "clock-in" | "clock-out") {
    const prev = shifts;
    // Optimistic flip — show the button state changed instantly.
    if (shifts) {
      setShifts(
        shifts.map((s) => {
          if (s.id !== shiftId) return s;
          if (action === "clock-in") return { ...s, workedStart: new Date().toISOString() };
          return { ...s, workedEnd: new Date().toISOString(), status: "WORKED" };
        }),
      );
    }
    let body: Record<string, number> = {};
    try {
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          () => resolve(null),
          { maximumAge: 60_000, timeout: 5000, enableHighAccuracy: false },
        );
      });
      if (pos) {
        body = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      }
    } catch {
      /* ignore — proceed without GPS */
    }
    try {
      const res = await fetch(`/api/g/shifts/${shiftId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `${action} failed`);
      }
      await reloadShifts();
    } catch (e: unknown) {
      setShifts(prev);
      alert(e instanceof Error ? e.message : `${action} failed`);
    }
  }

  // ---------- derived state ----------

  const isMultiCompany = (me?.memberships.length ?? 0) > 1;

  const partitioned = React.useMemo(() => {
    if (!shifts) return null;
    if (shifts.length === 0) return { hero: null as ShiftApi | null, rest: [] as ShiftApi[] };
    const now = Date.now();
    // Hero = the next shift that isn't yet WORKED. If none upcoming, take the earliest.
    const sorted = [...shifts].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const hero = sorted.find((s) => new Date(s.endAt).getTime() >= now) ?? sorted[0];
    const rest = sorted.filter((s) => s.id !== hero.id).slice(0, 5);
    return { hero, rest };
  }, [shifts]);

  const subline = (() => {
    if (!me) return "";
    if (activeCompany === "all" || !isMultiCompany) return me.identity.phone;
    return me.memberships.find((m) => m.companyId === activeCompany)?.companyName ?? me.identity.phone;
  })();

  // ---------- render ----------

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-12">
      <TopBar firstName={me?.identity.firstName} subline={subline} onAvatarTap={signOut} />

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

      {pushState === "needs_permission" && (
        <div className="mx-4 mt-3 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50 p-3 text-xs text-blue-900 dark:text-blue-100">
          <div className="font-medium">Enable notifications to get shift alerts.</div>
          <button
            onClick={enablePush}
            className="mt-2 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700 active:scale-[0.97] transition"
          >
            Enable notifications
          </button>
        </div>
      )}
      {pushState === "denied" && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 p-3 text-xs text-amber-900 dark:text-amber-100">
          <div className="font-medium">Push notifications not active.</div>
          <p className="mt-1">You&apos;ll keep getting SMS until this is fixed.</p>
          {pushDebug && (
            <p className="mt-2 font-mono text-[10px] break-all bg-amber-100 dark:bg-amber-900/40 p-1.5 rounded">
              {pushDebug}
            </p>
          )}
          <button
            onClick={enablePush}
            className="mt-2 rounded-lg bg-amber-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-amber-700 active:scale-[0.97] transition"
          >
            Try again
          </button>
        </div>
      )}

      {/* Hero card area */}
      <div className="px-4 pt-3">
        {shifts === null ? (
          <ShiftCardHeroSkeleton />
        ) : partitioned?.hero ? (
          <ShiftCardHero
            shift={mapShift(partitioned.hero)}
            showCompanyBadge={isMultiCompany && activeCompany === "all"}
            onTap={() => router.push(`/g/shifts/${partitioned.hero!.id}`)}
          >
            {partitioned.hero.status === "PENDING" && (
              <div className="flex gap-2">
                <Button
                  className="flex-1 h-10 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    void respond(partitioned.hero!.id, "accept");
                  }}
                >
                  Accept
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    const reason = prompt("Reject reason (optional):") ?? undefined;
                    void respond(partitioned.hero!.id, "reject", reason);
                  }}
                >
                  Decline
                </Button>
              </div>
            )}
            {partitioned.hero.status === "CONFIRMED" && !partitioned.hero.workedStart && (
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    void clockAction(partitioned.hero!.id, "clock-in");
                  }}
                >
                  Clock in
                </Button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const reason = prompt("Change to declined — reason?") ?? undefined;
                    if (reason !== undefined) void respond(partitioned.hero!.id, "reject", reason);
                  }}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 hover:underline self-end"
                >
                  Change to decline
                </button>
              </div>
            )}
            {partitioned.hero.status === "CONFIRMED" && partitioned.hero.workedStart && !partitioned.hero.workedEnd && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  ⏱ Clocked in {new Date(partitioned.hero.workedStart).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </p>
                <Button
                  className="w-full h-11 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    void clockAction(partitioned.hero!.id, "clock-out");
                  }}
                >
                  Clock out
                </Button>
              </div>
            )}
            {partitioned.hero.status === "REJECTED" && (
              <Button
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  void respond(partitioned.hero!.id, "accept");
                }}
              >
                Reconsider — accept
              </Button>
            )}
          </ShiftCardHero>
        ) : (
          <EmptyState
            icon={Calendar}
            title="You're all caught up"
            description="No shifts scheduled. We'll notify you when one's published."
          />
        )}
      </div>

      {/* Quick actions row — Phase 2-4 features visible but disabled */}
      <QuickActions />

      {/* Upcoming list */}
      {shifts === null ? (
        <div className="px-4 pt-6">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Upcoming</h3>
          <ul className="space-y-2">
            <ShiftCardCompactSkeleton />
            <ShiftCardCompactSkeleton />
            <ShiftCardCompactSkeleton />
          </ul>
        </div>
      ) : partitioned && partitioned.rest.length > 0 ? (
        <div className="px-4 pt-6">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Upcoming</h3>
          <ul className="space-y-2">
            {partitioned.rest.map((s) => (
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
        </div>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function TopBar({
  firstName,
  subline,
  onAvatarTap,
}: {
  firstName?: string;
  subline: string;
  onAvatarTap: () => void;
}) {
  const display = firstName ?? "…";
  const initials = (firstName ?? "")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <header className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Hi, {display}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subline}</p>
        </div>
        <button
          onClick={onAvatarTap}
          aria-label="Sign out"
          className={cn(
            "h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700",
            "flex items-center justify-center text-xs font-semibold",
            "text-slate-700 dark:text-slate-200 active:scale-95 transition",
          )}
        >
          {initials || "…"}
        </button>
      </div>
    </header>
  );
}

function QuickActions() {
  const router = useRouter();
  // Each item has its own behaviour; Phase 2-4 features still show
  // "coming soon" until their respective phase lands.
  const items: Array<{
    icon: typeof AlertTriangle;
    label: string;
    onClick: () => void;
    enabled: boolean;
  }> = [
    {
      icon: AlertTriangle,
      label: "Report",
      onClick: () => alert("Incident reports coming in a future update."),
      enabled: false,
    },
    {
      icon: Camera,
      label: "Check-in",
      onClick: () => alert("Photo check-ins coming in a future update."),
      enabled: false,
    },
    {
      icon: Clock,
      label: "Timesheets",
      onClick: () => router.push("/g/timesheets"),
      enabled: true,
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 px-4 pt-4">
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          onClick={it.onClick}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl",
            "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
            "py-3 transition active:scale-[0.97]",
            !it.enabled && "opacity-70",
          )}
        >
          <it.icon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function mapShift(s: ShiftApi): ShiftCardData {
  return {
    id: s.id,
    startAt: s.startAt,
    endAt: s.endAt,
    role: s.role,
    status: s.status,
    site: { name: s.site.name, address: s.site.address },
    company: s.company,
  };
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return buffer;
}
