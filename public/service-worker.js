/* JNP CRM Service Worker — handles push notifications and caching */
const CACHE_NAME = "jnp-crm-v1";

// Install
self.addEventListener("install", event => {
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", event => {
  event.waitUntil(clients.claim());
});

// Handle push notifications from main thread
self.addEventListener("message", event => {
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, url } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        tag: tag || "jnp-reminder",
        icon: "/logo192.png",
        badge: "/logo192.png",
        vibrate: [200, 100, 200],
        data: { url: url || "/" },
        requireInteraction: false,
      })
    );
  }

  if (event.data?.type === "SCHEDULE_CHECK") {
    // Acknowledged — main thread handles scheduling
  }
});

// Handle notification click
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data?.url || "/");
      }
    })
  );
});

// Fetch — network first for API, cache for assets
self.addEventListener("fetch", event => {
  if (event.request.url.includes("/api/") || event.request.url.includes("supabase")) {
    return; // Don't cache API calls
  }
});
