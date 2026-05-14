/* Vigilo Guards service worker
 *
 * Responsibilities:
 *   - Handle Web Push events: show a notification with title/body from payload.
 *   - On notification click: focus an open /g window or open one.
 *
 * Scope is /g (registered with that scope). Does not cache anything yet —
 * offline shell caching can land later without changing the dispatch path.
 */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
