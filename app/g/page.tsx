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
  site: { id: string; name: string; address: string };
  rosterName: string;
  company: { id: string; name: string; brandColour: string | null } | null;
}

const ACTIVE_COMPANY_KEY = "vg_active_company";

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function GuardHomePage() {
  const router = useRouter();
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [shifts, setShifts] = React.useState<ShiftApi[] | null>(null);
  const [activeCompany, setActiveCompany] = React.useState<string>("all");
  const [pushState, setPushState] = React.useState<
    "unknown" | "subscribed" | "denied" | "unsupported" | "needs_permission"
  >("unknown");
  const [pushDebug, setPushDebug] = React.useState<string | null>(null);
  const swRegRef = React.useRef<ServiceWorkerRegistration | null>(null);

  // 1. Fetch identity + memberships; redirect to sign-in on 401.
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
        const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_COMPANY_KEY) : null;
        if (stored && (stored === "all" || json.memberships.some((m) => m.companyId === stored))) {
          setActiveCompany(stored);
        } else if (json.memberships.length === 1) {
          setActiveCompany(json.memberships[0].companyId);
        } else {
          setActiveCompany("all");
        }
      } catch {
        /* swallow — page will sit in skeleton state */
      }
    })();
  }, [router]);

  // 2. Fetch shifts whenever active company changes.
  const reloadShifts = React.useCallback(async () => {
    if (!me) return;
    try {
      const q = activeCompany === "all" ? "" : `?companyId=${encodeURIComponent(activeCompany)}`;
      const res = await fetch(`/api/g/shifts${q}`);
      const json = await res.json();
      if (res.ok) setShifts(json.shifts ?? []);
    } catch {
      /* leave previous state */
    }
  }, [me, activeCompany]);

  React.useEffect(() => {
    void reloadShifts();
  }, [reloadShifts]);

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
            {partitioned.hero.status === "CONFIRMED" && (
              <Button
                variant="outline"
                className="w-full h-10"
                onClick={(e) => {
                  e.stopPropagation();
                  const reason = prompt("Change to declined — reason?") ?? undefined;
                  void respond(partitioned.hero!.id, "reject", reason);
                }}
              >
                Change to decline
              </Button>
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
  // Phase 2-4 features. Rendered but inert in Phase 1 — gives the home
  // screen visual density and signals what's coming. The onClick is a
  // friendly placeholder; behaviour lands per phase.
  const items = [
    { icon: AlertTriangle, label: "Report" },
    { icon: Camera, label: "Check-in" },
    { icon: Clock, label: "Timesheets" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 px-4 pt-4">
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          onClick={() => alert("Coming soon — available in a future update.")}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl",
            "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
            "py-3 transition active:scale-[0.97]",
            "opacity-70",
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
