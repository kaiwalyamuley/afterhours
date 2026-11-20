// Starts a YOUPI PG checkout for a customer's own pending UPI order.
// The amount always comes from the database, never from the browser, and the
// merchant key exists only in Supabase secrets.
// Secrets: YOUPI_API_URL, YOUPI_MERCHANT_ID, YOUPI_MERCHANT_KEY.
const ALLOWED_ORIGINS = ["https://wearafterhours.store", "http://localhost:5180"];
const RETURN_URL = "https://wearafterhours.store/#/orders";
const env = (name: string) => Deno.env.get(name) || "";

class Problem extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

async function database(path: string) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Problem(500, "Database error");
  return response.json();
}

async function currentUser(request: Request) {
  const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: request.headers.get("authorization") || "" },
  });
  const user = response.ok ? await response.json() : null;
  if (!user?.id) throw new Problem(401, "Please sign in again");
  return user.id as string;
}

async function startPayment(orderId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Problem(400, "Invalid order");
  const [settings] = await database("store_settings?id=eq.1&select=upi_gateway_on");
  if (!settings?.upi_gateway_on) throw new Problem(409, "Automatic UPI checkout is switched off");
  const apiUrl = env("YOUPI_API_URL").replace(/\/+$/, "");
  if (!apiUrl || !env("YOUPI_MERCHANT_ID") || !env("YOUPI_MERCHANT_KEY")) throw new Problem(503, "The payment gateway is not connected yet");

  const [order] = await database(`orders?id=eq.${orderId}&select=id,order_no,user_id,status,payment_method,payment_status,amount_due_now`);
  if (!order || order.user_id !== userId) throw new Problem(404, "Order not found");
  if (order.status !== "pending" || !["awaiting", "failed"].includes(order.payment_status)) throw new Problem(409, "This order is not waiting for a payment");
  if (order.payment_method === "cod" || !(order.amount_due_now > 0)) throw new Problem(409, "This order has nothing to pay by UPI");

  const response = await fetch(`${apiUrl}/api/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Merchant-Id": env("YOUPI_MERCHANT_ID"),
      "X-Merchant-Key": env("YOUPI_MERCHANT_KEY"),
    },
    body: JSON.stringify({
      orderId: order.id,
      amount: Number(order.amount_due_now).toFixed(2),
      currency: "INR",
      returnUrl: RETURN_URL,
      metadata: { orderNo: order.order_no },
    }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!response) throw new Problem(502, "The payment gateway is not reachable right now");
  const data = await response.json().catch(() => ({}));
  if (response.status === 503) throw new Problem(503, "Automatic payment checking is offline right now");
  if (!response.ok || !data.checkoutUrl) throw new Problem(502, data.message || data.error || "The payment gateway could not start a payment");
  const url = new URL(data.checkoutUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Problem(502, "The payment gateway returned an unsafe link");
  return { checkout_url: url.href };
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    if (request.method !== "POST") throw new Problem(405, "Method not allowed");
    const userId = await currentUser(request);
    const { order_id: orderId } = await request.json();
    return reply(200, await startPayment(String(orderId || ""), userId));
  } catch (error) {
    if (error instanceof Problem) return reply(error.status, { error: error.message });
    console.error(error);
    return reply(500, { error: "Something went wrong while starting the payment" });
  }
});
