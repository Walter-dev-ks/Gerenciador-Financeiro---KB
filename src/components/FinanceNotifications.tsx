import { useEffect } from "react";

import { savePushSubscription } from "@/lib/push";

const PERMISSION_KEY = "finance_notifications_permission_requested";

async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}

async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;

  try {
    localStorage.setItem(PERMISSION_KEY, "true");
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const registration = await navigator.serviceWorker.ready;
      await savePushSubscription(registration);
    }
  } catch {
    localStorage.removeItem(PERMISSION_KEY);
  }
}

export function FinanceNotifications() {
  useEffect(() => {
    registerServiceWorker().then((registration) => {
      if (registration && Notification.permission === "granted") {
        savePushSubscription(registration);
      }
    });

    const askOnFirstInteraction = () => {
      if (localStorage.getItem(PERMISSION_KEY) !== "true") {
        requestNotificationPermission();
      }
    };

    window.addEventListener("pointerdown", askOnFirstInteraction, { once: true });
    window.addEventListener("keydown", askOnFirstInteraction, { once: true });

    return () => {
      window.removeEventListener("pointerdown", askOnFirstInteraction);
      window.removeEventListener("keydown", askOnFirstInteraction);
    };
  }, []);

  return null;
}
