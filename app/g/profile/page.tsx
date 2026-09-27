"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Bell, Clock, Building2 } from "lucide-react";
import { Skeleton } from "@/components/g/skeleton";
import { useToast } from "@/components/ui/toast";
import { companyColour } from "@/lib/g/design";

interface Membership {
  guardId: string;
  companyId: string;
  companyName: string;
  companyBrandColour: string | null;
  isSupervisor: boolean;
}

interface MeResponse {
  identity: { firstName: string; lastName: string; phone: string };
  memberships: Membership[];
}

interface PreferencesResp {
  notificationsEnabled: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = React.useState<boolean | null>(null);
  const [savingPref, setSavingPref] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const [meRes, prefRes] = await Promise.all([
          fetch("/api/g/me"),
          fetch("/api/g/preferences"),
        ]);
        if (meRes.status === 401) {
          router.replace("/g/sign-in");
          return;
        }
        if (meRes.ok) setMe(await meRes.json());
        if (prefRes.ok) setNotificationsEnabled(((await prefRes.json()) as PreferencesResp).notificationsEnabled);
      } catch {
        /* swallow */
      }
    })();
  }, [router]);

  async function toggleNotifications() {
    if (notificationsEnabled === null || savingPref) return;
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    setSavingPref(true);
    try {
      const res = await fetch("/api/g/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationsEnabled: next }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({
        title: next ? "Push notifications enabled" : "Push notifications disabled",
        description: next ? undefined : "You'll get shift updates by SMS instead.",
        variant: "success",
      });
    } catch {
      setNotificationsEnabled(!next);
      toast({ title: "Could not save that change", variant: "error" });
    } finally {
      setSavingPref(false);
    }
  }

  async function signOut() {
    if (!confirm("Sign out of Vigilo Guards?")) return;
    await fetch("/api/g/auth/sign-out", { method: "POST" });
    router.replace("/g/sign-in");
  }

  const initials = (me?.identity.firstName ?? "")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-tabbar">
      <header className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Profile</h1>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {!me ? (
          <>
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </>
        ) : (
          <>
            <section className="flex items-center gap-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4">
              <div className="h-14 w-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                {initials || "…"}
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {me.identity.firstName} {me.identity.lastName}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{me.identity.phone}</p>
              </div>
            </section>

            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1.5">
                <Building2 className="h-4 w-4" /> Companies
              </h2>
              <ul className="space-y-2">
                {me.memberships.map((m) => (
                  <li key={m.companyId} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: companyColour(m.companyBrandColour, m.companyId) }}
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{m.companyName}</span>
                    {m.isSupervisor && (
                      <span className="text-[10px] uppercase tracking-wide font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-500/15 px-1.5 py-0.5 rounded">
                        Supervisor
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4">
              <button
                type="button"
                onClick={toggleNotifications}
                disabled={notificationsEnabled === null}
                className="w-full flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                  <Bell className="h-4 w-4" /> Push notifications
                </span>
                <span
                  className={
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
                    (notificationsEnabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600")
                  }
                  aria-hidden
                >
                  <span
                    className={
                      "inline-block h-[18px] w-[18px] transform rounded-full bg-white transition-transform " +
                      (notificationsEnabled ? "translate-x-6" : "translate-x-1")
                    }
                  />
                </span>
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                When off, you&apos;ll get shift updates by SMS instead of app notifications.
              </p>
            </section>

            <button
              type="button"
              onClick={() => router.push("/g/timesheets")}
              className="w-full flex items-center gap-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-800 dark:text-slate-200 active:scale-[0.99] transition"
            >
              <Clock className="h-4 w-4" /> View timesheets
            </button>

            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm font-medium text-red-700 dark:text-red-400 active:scale-[0.99] transition"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
