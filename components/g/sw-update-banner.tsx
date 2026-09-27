"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

/**
 * Watches the /g service worker for an update that's installed and
 * waiting to take over, and lets the guard confirm before it does.
 *
 * The service worker (public/g/sw.js) deliberately does NOT call
 * skipWaiting() on install — an update sits in "waiting" until this banner
 * posts SKIP_WAITING, so a background deploy can never take over mid
 * clock-in/out or shift response. Once the guard taps "Update", the new
 * worker activates and we reload once (via controllerchange) to pick it up.
 */
export function SwUpdateBanner() {
  const [waiting, setWaiting] = React.useState<ServiceWorker | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let cancelled = false;
    function watch(reg: ServiceWorkerRegistration) {
      if (reg.waiting && reg.active) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && reg.active) {
            setWaiting(reg.waiting);
          }
        });
      });
    }

    (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!cancelled && reg) watch(reg);
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div className="sticky top-0 z-40 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900">
      <button
        type="button"
        onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium active:opacity-80"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        A new version of the app is ready — tap to update
      </button>
    </div>
  );
}
