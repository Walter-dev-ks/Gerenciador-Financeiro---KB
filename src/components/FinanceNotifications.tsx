import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/finance";

type TransactionNotificationPayload = {
  amount?: number | string;
  description?: string;
  type?: "INCOME" | "EXPENSE" | "TRANSFER";
};

const PERMISSION_KEY = "finance_notifications_permission_requested";

function transactionTitle(type: TransactionNotificationPayload["type"]) {
  if (type === "INCOME") return "Nova entrada registrada";
  if (type === "EXPENSE") return "Nova saída registrada";
  return "Novo lançamento registrado";
}

function transactionBody(transaction: TransactionNotificationPayload) {
  const amount = Number(transaction.amount ?? 0);
  const description = transaction.description?.trim() || "Lançamento sem descrição";
  return `${description} · ${brl(amount)}`;
}

async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}

async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;

  try {
    localStorage.setItem(PERMISSION_KEY, "true");
    await Notification.requestPermission();
  } catch {
    localStorage.removeItem(PERMISSION_KEY);
  }
}

async function showTransactionNotification(transaction: TransactionNotificationPayload) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  if (registration.active) {
    registration.active.postMessage({
      type: "FINANCE_NOTIFICATION",
      title: transactionTitle(transaction.type),
      options: {
        body: transactionBody(transaction),
        data: { url: "/transacoes" },
      },
    });
    return;
  }

  await registration.showNotification(transactionTitle(transaction.type), {
    body: transactionBody(transaction),
    badge: "/icon-192.png",
    icon: "/icon-192.png",
    tag: "finance-transaction",
    renotify: true,
    data: { url: "/transacoes" },
  });
}

export function FinanceNotifications() {
  useEffect(() => {
    registerServiceWorker();

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

  useEffect(() => {
    const channel = supabase
      .channel("finance-transaction-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions" },
        (payload) => {
          showTransactionNotification(payload.new as TransactionNotificationPayload);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
