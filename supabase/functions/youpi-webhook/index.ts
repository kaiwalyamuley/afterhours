// Receives signed YOUPI PG payment events and applies them to AfterHours orders.
// A gateway alert (OBSERVED_SUCCESS) only marks the payment as submitted, exactly as
// if the customer had typed the reference, so the owner still verifies it.
// A matched bank statement line (RECONCILED) marks it verified.
// Secret: YOUPI_WEBHOOK_SECRET.
const env = (name: string) => Deno.env.get(name) || "";
const encoder = new TextEncoder();
const HANDLED = new Set(["OBSERVED_SUCCESS", "RECONCILED", "MANUAL_REVIEW", "FAILED", "EXPIRED", "CANCELLED"]);

async function hmacHex(secret: string, body: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, body)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const secret = env("YOUPI_WEBHOOK_SECRET");
  if (!secret) return reply(503, { error: "Webhook secret is not set" });

  // The signature covers the raw bytes, so check it before parsing anything.
  const raw = new Uint8Array(await request.arrayBuffer());
  const presented = (request.headers.get("x-gateway-signature") || "").replace(/^sha256=/, "");
  if (!sameText(presented, await hmacHex(secret, raw))) return reply(401, { error: "Invalid signature" });

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return reply(400, { error: "Invalid body" });
  }
  const name = String(event.event || "");
  if (!HANDLED.has(name) || event.method !== "UPI") return reply(200, { ignored: true });
  if (name === "RECONCILED" && event.settlementState !== "RECONCILED") return reply(200, { ignored: true });
  const orderId = String(event.orderId || "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !event.deliveryId) return reply(200, { ignored: true });

  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/gateway_event`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_delivery_id: String(event.deliveryId),
      p_event: name,
      p_order_id: orderId,
      p_payment_id: String(event.paymentId || ""),
      p_amount_paise: Number(event.amountPaise),
      p_utr: String(event.utr || ""),
    }),
  });
  if (!response.ok) {
    console.error("gateway_event failed", response.status, (await response.text()).slice(0, 200));
    return reply(500, { error: "Could not record the event" }); // The gateway will retry.
  }
  return reply(200, { received: true, result: await response.json() });
});
