import { createClient } from "npm:@supabase/supabase-js@2";

const PUSH_SECRET = "64lZnKLiH0ifMtYiD2gWDp5Ep3dBBFGvm2puwG6RPlI";
const VAPID_PUBLIC_KEY =
  "BF-0N6c7FLSHzYF5Q96nSTDJ59ppd3tMDlnMaJPiFSTHySwuATDyeC6UB6PploFNAw6cNfupQOo6b15UuF9bN1M";
const VAPID_PRIVATE_JWK: JsonWebKey = {
  kty: "EC",
  x: "X7Q3pzsUtIfNgXlD3qdJMMnn2ml3e0wOWcxok-IVJMc",
  y: "ySwuATDyeC6UB6PploFNAw6cNfupQOo6b15UuF9bN1M",
  crv: "P-256",
  d: "JhISpdwwsKUJMIk3mkqwta2kwxoA7UXpZXU-_0SpBKI",
};

type PushSubscriptionRow = {
  endpoint: string;
};

function base64Url(input: string | ArrayBuffer | Uint8Array) {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createVapidJwt(audience: string) {
  const header = base64Url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = base64Url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: "mailto:financeiro@example.com",
    }),
  );
  const unsignedToken = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "jwk",
    VAPID_PRIVATE_JWK,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken),
  );

  return `${unsignedToken}.${base64Url(signature)}`;
}

async function sendPush(endpoint: string) {
  const audience = new URL(endpoint).origin;
  const jwt = await createVapidJwt(audience);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
      TTL: "60",
      Urgency: "normal",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (req.headers.get("x-finance-push-secret") !== PUSH_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: "Missing Supabase server environment" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .returns<PushSubscriptionRow[]>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results = await Promise.allSettled((data ?? []).map(({ endpoint }) => sendPush(endpoint)));
  const expiredEndpoints: string[] = [];

  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    if (result.value.status === 404 || result.value.status === 410) {
      const endpoint = data?.[index]?.endpoint;
      if (endpoint) expiredEndpoints.push(endpoint);
    }
  });

  if (expiredEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
  }

  return Response.json({
    subscriptions: data?.length ?? 0,
    sent: results.filter((result) => result.status === "fulfilled").length,
    expired: expiredEndpoints.length,
  });
});
