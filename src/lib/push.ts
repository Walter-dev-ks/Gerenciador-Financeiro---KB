import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY =
  "BF-0N6c7FLSHzYF5Q96nSTDJ59ppd3tMDlnMaJPiFSTHySwuATDyeC6UB6PploFNAw6cNfupQOo6b15UuF9bN1M";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export async function savePushSubscription(registration: ServiceWorkerRegistration) {
  if (!("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) return;

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[Push] Could not save subscription", error);
  }
}
