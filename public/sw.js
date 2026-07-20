self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "FINANCE_NOTIFICATION") return;

  const { title, options } = event.data;
  event.waitUntil(
    self.registration.showNotification(title, {
      badge: "/icon-192.png",
      icon: "/icon-192.png",
      tag: "finance-transaction",
      renotify: true,
      ...options,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const appClient = clients.find((client) => "focus" in client);
      if (appClient) return appClient.focus();
      return self.clients.openWindow("/");
    }),
  );
});
