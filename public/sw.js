const SUPABASE_URL = "https://oxsbueflizmomkvviiep.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Fn_GYZsP8c_G_8ts3hGLeg_55p83xRK";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function formatBrl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0),
  );
}

function transactionTitle(type) {
  if (type === "INCOME") return "Nova entrada registrada";
  if (type === "EXPENSE") return "Nova saída registrada";
  return "Novo lançamento registrado";
}

async function fetchLatestTransaction() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/transactions?select=description,amount,type,created_at&order=created_at.desc&limit=1`,
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
    },
  );
  if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
  const [transaction] = await response.json();
  return transaction;
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    fetchLatestTransaction()
      .then((transaction) => {
        if (!transaction) return;
        const description = transaction.description?.trim() || "Lançamento sem descrição";
        return self.registration.showNotification(transactionTitle(transaction.type), {
          body: `${description} · ${formatBrl(transaction.amount)}`,
          badge: "/icon-192.png",
          icon: "/icon-192.png",
          tag: `finance-transaction-${transaction.created_at}`,
          data: { url: "/transacoes" },
        });
      })
      .catch((error) => {
        console.error("[Push] Could not show notification", error);
        return self.registration.showNotification("Novo lançamento registrado", {
          badge: "/icon-192.png",
          icon: "/icon-192.png",
          tag: "finance-transaction",
          data: { url: "/transacoes" },
        });
      }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const appClient = clients.find((client) => "focus" in client);
      if (appClient) return appClient.focus();
      return self.clients.openWindow(targetUrl);
    }),
  );
});
