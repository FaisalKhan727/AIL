"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

interface Membership {
  guardId: string;
  companyId: string;
  companyName: string;
  companyBrandColour: string | null;
}

interface MeResponse {
  identity: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  memberships: Membership[];
  vapidPublicKey: string;
}

interface Shift {
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

export default function GuardHomePage() {
  const router = useRouter();
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [shifts, setShifts] = React.useState<Shift[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeCompany, setActiveCompany] = React.useState<string>("all");
  const [pushState, setPushState] = React.useState<
    "unknown" | "subscribed" | "denied" | "unsupported" | "needs_permission"
  >("unknown");

  // 1. Fetch identity + memberships; redirect to sign-in on 401.
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/g/me");
        if (res.status === 401) {
          router.replace("/g/sign-in");
          return;
        }
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const json = (await res.json()) as MeResponse;
        setMe(json);
        const stored = localStorage.getItem(ACTIVE_COMPANY_KEY);
        if (stored && (stored === "all" || json.memberships.some((m) => m.companyId === stored))) {
          setActiveCompany(stored);
        } else if (json.memberships.length === 1) {
          setActiveCompany(json.memberships[0].companyId);
        } else {
          setActiveCompany("all");
        }
      } catch {
        setLoading(false);
      }
    })();
  }, [router]);

  // 2. Fetch shifts whenever activeCompany changes.
  const reloadShifts = React.useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      const q = activeCompany === "all" ? "" : `?companyId=${encodeURIComponent(activeCompany)}`;
      const res = await fetch(`/api/g/shifts${q}`);
      const json = await res.json();
      if (res.ok) setShifts(json.shifts ?? []);
    } finally {
      setLoading(false);
    }
  }, [me, activeCompany]);

  React.useEffect(() => {
    void reloadShifts();
  }, [reloadShifts]);

  // 3. Persist active company.
  React.useEffect(() => {
    if (me) localStorage.setItem(ACTIVE_COMPANY_KEY, activeCompany);
  }, [me, activeCompany]);

  // 4. Register service worker and check existing push permission state.
  //
  // iOS Safari blocks Notification.requestPermission() unless it originates
  // from a user gesture (button tap) — calling it auto in useEffect just
  // returns "default" with no prompt shown. So this effect only registers
  // the SW and inspects state. The actual permission request happens in
  // enablePush() below, wired to a button.
  const [pushDebug, setPushDebug] = React.useState<string | null>(null);
  const swRegRef = React.useRef<ServiceWorkerRegistration | null>(null);

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
    // Must be called from a user-gesture (button onClick).
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
      const msg = err instanceof Error ? err.message : String(err);
      setPushDebug(msg);
      console.error("[guard PWA] enablePush failed:", err);
    }
  }, [subscribeAndPost]);

  React.useEffect(() => {
    if (!me) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      setPushDebug("Browser lacks serviceWorker or PushManager.");
      return;
    }
    if (!me.vapidPublicKey) {
      setPushState("denied");
      setPushDebug("Server returned no VAPID public key — env var missing on server.");
      console.error("[guard PWA] /api/g/me returned empty vapidPublicKey");
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/g/sw.js", { scope: "/g" });
        swRegRef.current = reg;
        const perm = Notification.permission;
        if (perm === "granted") {
          // Already granted on a previous session — silently ensure subscription exists.
          await subscribeAndPost(reg);
          setPushState("subscribed");
        } else if (perm === "denied") {
          setPushState("denied");
          setPushDebug(
            "Notifications are blocked. Open iOS Settings → Notifications → Vigilo Guards.",
          );
        } else {
          // "default" — needs the user to tap the Enable button.
          setPushState("needs_permission");
        }
      } catch (err) {
        setPushState("denied");
        const msg = err instanceof Error ? err.message : String(err);
        setPushDebug(msg);
        console.error("[guard PWA] init failed:", err);
      }
    })();
  }, [me, subscribeAndPost]);

  async function respond(shiftId: string, action: "accept" | "reject", reason?: string) {
    const res = await fetch(`/api/g/shifts/${shiftId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "reject" ? JSON.stringify({ reason }) : "{}",
    });
    if (res.ok) {
      await reloadShifts();
    } else {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? `${action} failed`);
    }
  }

  if (!me) {
    return <div className="p-6 text-slate-500 text-sm">Loading…</div>;
  }

  const isMultiCompany = me.memberships.length > 1;
  const activeMembership =
    activeCompany === "all"
      ? null
      : me.memberships.find((m) => m.companyId === activeCompany) ?? null;

  return (
    <div className="max-w-md mx-auto px-4 py-6 pb-24">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Hi, {me.identity.firstName}
          </h1>
          <p className="text-xs text-slate-500">{me.identity.phone}</p>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/g/auth/sign-out", { method: "POST" });
            router.replace("/g/sign-in");
          }}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Sign out
        </button>
      </header>

      {isMultiCompany && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            <CompanyChip
              label="All"
              colour={null}
              active={activeCompany === "all"}
              onClick={() => setActiveCompany("all")}
            />
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
        <div className="mb-4 rounded border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900">
          <div className="font-medium">One more step: enable notifications.</div>
          <div className="mt-1">
            Tap the button below and choose <span className="font-medium">Allow</span> when iOS asks. Until you do, you&apos;ll keep getting SMS instead of push.
          </div>
          <button
            onClick={enablePush}
            className="mt-2 rounded bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700"
          >
            Enable notifications
          </button>
        </div>
      )}
      {pushState === "denied" && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="font-medium">Push notifications not active.</div>
          <div className="mt-1">
            You&apos;ll keep getting SMS until this is fixed. On iPhone, the app must be added to the Home Screen via Safari Share first, then opened from the Home Screen icon.
          </div>
          {pushDebug && (
            <div className="mt-2 font-mono text-[10px] break-all bg-amber-100 p-1.5 rounded">
              {pushDebug}
            </div>
          )}
          <button
            onClick={enablePush}
            className="mt-2 rounded bg-amber-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-amber-700"
          >
            Try again
          </button>
        </div>
      )}
      {pushState === "unsupported" && (
        <div className="mb-4 rounded border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="font-medium">Push notifications aren&apos;t supported by this browser.</div>
          <div className="mt-1">
            On iPhone: add this app to your home screen via the Safari Share menu, then open it from the Home Screen icon.
          </div>
          {pushDebug && (
            <div className="mt-2 font-mono text-[10px] break-all bg-slate-100 p-1.5 rounded">
              {pushDebug}
            </div>
          )}
        </div>
      )}

      <h2 className="text-sm font-medium text-slate-700 mb-2">
        {activeMembership ? `${activeMembership.companyName} shifts` : "All shifts"}
      </h2>

      {loading && shifts.length === 0 ? (
        <p className="text-sm text-slate-500">Loading shifts…</p>
      ) : shifts.length === 0 ? (
        <p className="text-sm text-slate-500">No upcoming shifts.</p>
      ) : (
        <ul className="space-y-3">
          {shifts.map((s) => (
            <ShiftCard
              key={s.id}
              shift={s}
              showCompanyBadge={isMultiCompany && activeCompany === "all"}
              onAccept={() => respond(s.id, "accept")}
              onReject={() => {
                const reason = prompt("Reject reason (optional):") ?? undefined;
                void respond(s.id, "reject", reason);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CompanyChip({
  label,
  colour,
  active,
  onClick,
}: {
  label: string;
  colour: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-300"
      }`}
    >
      {colour && (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: colour }}
        />
      )}
      {label}
    </button>
  );
}

function ShiftCard({
  shift,
  showCompanyBadge,
  onAccept,
  onReject,
}: {
  shift: Shift;
  showCompanyBadge: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const start = new Date(shift.startAt);
  const end = new Date(shift.endAt);
  const stripeColour =
    shift.company?.brandColour ?? "#0B1E3F";

  return (
    <li className="relative overflow-hidden rounded-lg bg-white shadow-sm border border-slate-200">
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{ backgroundColor: stripeColour }}
      />
      <div className="pl-4 pr-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{shift.site.name}</p>
            <p className="text-xs text-slate-500 truncate">{shift.site.address}</p>
          </div>
          {showCompanyBadge && shift.company && (
            <span className="text-[10px] uppercase tracking-wide font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
              {shift.company.name}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-slate-700">
          {start.toLocaleString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}{" "}
          {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} –{" "}
          {end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </p>
        {shift.role && (
          <p className="text-xs text-slate-500 mt-1">{shift.role}</p>
        )}
        {shift.notes && (
          <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{shift.notes}</p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <StatusPill status={shift.status} />
          {shift.status === "PENDING" && (
            <>
              <button
                onClick={onAccept}
                className="ml-auto text-xs bg-emerald-600 text-white px-3 py-1.5 rounded font-medium hover:bg-emerald-700"
              >
                Accept
              </button>
              <button
                onClick={onReject}
                className="text-xs bg-white text-slate-700 border border-slate-300 px-3 py-1.5 rounded font-medium hover:bg-slate-50"
              >
                Reject
              </button>
            </>
          )}
          {shift.status === "CONFIRMED" && (
            <button
              onClick={onReject}
              className="ml-auto text-xs text-slate-500 hover:text-red-600 underline"
            >
              Change to reject
            </button>
          )}
          {shift.status === "REJECTED" && (
            <button
              onClick={onAccept}
              className="ml-auto text-xs text-emerald-700 hover:underline"
            >
              Reconsider — accept
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function StatusPill({ status }: { status: Shift["status"] }) {
  const map: Record<Shift["status"], string> = {
    PENDING: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-red-100 text-red-800",
    WORKED: "bg-emerald-200 text-emerald-900",
    NO_SHOW: "bg-slate-100 text-slate-600",
    CANCELLED: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded ${map[status]}`}>
      {status}
    </span>
  );
}

// VAPID public key conversion (base64url → ArrayBuffer) for PushManager.subscribe.
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return buffer;
}
