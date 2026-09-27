/* Vigilo Guards service worker
 *
 * Responsibilities:
 *   - Handle Web Push events: show a notification with title/body from payload.
 *   - On notification click: focus an open /g window or open one.
 *   - Cache the app shell + static assets so the PWA opens (with whatever
 *     was last loaded) even with no connection.
 *   - Let the update-available banner (components/g/sw-update-banner.tsx)
 *     control exactly when a new version takes over, instead of forcing it
 *     on every guard mid-session.
 *
 * Scope is /g (registered with that scope).
 *
 * Deliberately NOT handled here: anything under /api/, and any non-GET
 * request (clock-in/out, accept/reject, etc. are all POST). Both are
 * excluded from the fetch handler below so a guard's live data and their
 * in-flight actions are never served from — or delayed by — this cache.
 */

const CACHE_NAME = "vg-guard-shell-v1";
const APP_SHELL_URLS = ["/g", "/g/manifest.json", "/icon-192.svg", "/icon-512.svg"];

self.addEventListener("install", (event) => {
  // No skipWaiting() here — an update sits in "waiting" until the guard
  // confirms via the update banner (message below), so an in-progress
  // clock-in/out or shift response is never interrupted by a background
  // deploy taking over mid-action.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => {
        /* offline install / one of the shell URLs missing — non-fatal */
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Never intercept mutations — clock-in/out, accept/reject, SMS send,
  // etc. are all POST/PATCH/PUT and must always hit the network directly.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache API responses — shift status, timesheets, notifications
  // etc. must always be live, never served stale from a cache.
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    // Network-first for page loads: fresh content whenever online, and a
    // cached copy (falling back to the cached app shell) instead of a
    // browser error page when offline.
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(req)) || (await cache.match("/g")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets (hashed Next.js build files, icons, manifest) — a given
  // URL's content never changes, so cache-first is safe and fast.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Vigilo Guards", body: event.data.text() };
  }
  const title = payload.title || "Vigilo Guards";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
    data: {
      url: payload.url || "/g",
      meta: payload.data || {},
    },
    tag: payload.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/g";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if (client.url.includes("/g") && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              // Ignore — navigate fails cross-origin or on some browsers.
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
