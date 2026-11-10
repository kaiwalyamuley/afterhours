// One data interface for the app, backed by Supabase. Local testing can load
// practice data with ?demo=1, and that code is left out of the published site.
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const wantsDemo = new URLSearchParams(location.search).get("demo") === "1";
export const DEMO = isLocal && wantsDemo;

const UPLOAD_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
const MAX_UPLOAD = 15 * 1024 * 1024;

const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

async function liveApi() {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm");
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
  });

  const profile = async (user) => {
    if (!user) return null;
    const row = unwrap(await db.from("profiles").select("*").eq("id", user.id).maybeSingle());
    const access = unwrap(await db.rpc("my_access"));
    return { ...(row || { id: user.id, email: user.email, full_name: user.user_metadata?.full_name, role: "customer" }), access };
  };
  const orderSelect = "*, order_items(*)";

  const callShipping = async (body) => {
    const { data, error } = await db.functions.invoke("ship-order", { body });
    if (!error) return data;
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(details?.error || "Could not reach the shipping service. Please try again.");
  };

  return {
    async currentProfile() {
      const { data } = await db.auth.getSession();
      return profile(data.session?.user);
    },
    // Supabase repeats SIGNED_IN whenever the tab regains focus, including after
    // a file picker closes, so only a real change of account counts here.
    async onAuthChange(handler) {
      let known = (await db.auth.getSession()).data.session?.user?.id ?? null;
      db.auth.onAuthStateChange((_event, session) => {
        const id = session?.user?.id ?? null;
        if (id === known) return;
        known = id;
        setTimeout(handler, 0);
      });
    },
    async signIn() {
      const settings = await (await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })).json();
      if (!settings.external?.google) throw new Error("Google sign-in is not switched on yet.");
      unwrap(await db.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + location.pathname },
      }));
    },
    async signOut() {
      await db.auth.signOut();
    },
    async products() {
      return unwrap(await db.from("products").select("*").order("sort"));
    },
    async settings() {
      return unwrap(await db.from("store_settings").select("*").eq("id", 1).single());
    },
    async saveSettings(values) {
      unwrap(await db.from("store_settings").update({ ...values, updated_at: new Date().toISOString() }).eq("id", 1));
    },
    async placeOrder(items, address, note, payment, coupon) {
      const rows = unwrap(await db.rpc("place_order", { p_items: items, p_address: address, p_note: note, p_payment: payment, p_coupon: coupon || "" }));
      return rows[0];
    },
    async checkCoupon(code, items) {
      const rows = unwrap(await db.rpc("check_coupon", { p_code: code, p_items: items }));
      return rows[0];
    },
    async coupons() {
      return unwrap(await db.from("coupons").select("*").order("created_at", { ascending: false }));
    },
    async addCoupon(values) {
      unwrap(await db.from("coupons").insert(values));
    },
    async updateCoupon(id, values) {
      unwrap(await db.from("coupons").update(values).eq("id", id));
    },
    async reportOrders() {
      return unwrap(await db.from("orders").select(orderSelect).order("created_at", { ascending: false }).limit(5000));
    },
    async reviews() {
      return unwrap(await db.from("product_reviews").select("id,product_id,rating,comment,reviewer_name,created_at").eq("status", "published").order("created_at", { ascending: false }).limit(1000));
    },
    async staffReviews() {
      return unwrap(await db.from("product_reviews").select("id,product_id,rating,comment,reviewer_name,status,created_at").order("created_at", { ascending: false }).limit(300));
    },
    async setReviewStatus(id, status) {
      unwrap(await db.from("product_reviews").update({ status }).eq("id", id));
    },
    async submitReview(productId, rating, comment) {
      unwrap(await db.rpc("submit_review", { p_product_id: productId, p_rating: rating, p_comment: comment }));
    },
    async myReviews() {
      return unwrap(await db.rpc("my_reviews"));
    },
    async connectAlerts() {
      const { data, error } = await db.functions.invoke("notify-owner", { body: { kind: "connect" } });
      if (!error) return data;
      const details = await error.context?.json?.().catch(() => null);
      throw new Error(details?.error || "Could not reach the alert service. Please try again.");
    },
    async shipRates(orderId, pickup) {
      return callShipping({ action: "rates", order_id: orderId, pickup });
    },
    async shipBook(orderId, courierId, pickup) {
      return callShipping({ action: "book", order_id: orderId, courier_id: courierId, pickup });
    },
    async submitPaymentRef(orderId, ref) {
      unwrap(await db.rpc("submit_payment_ref", { p_order_id: orderId, p_ref: ref }));
    },
    async paymentAction(orderId, action) {
      unwrap(await db.rpc("owner_payment_action", { p_order_id: orderId, p_action: action }));
    },
    async myOrders(userId) {
      return unwrap(await db.from("orders").select(orderSelect).eq("user_id", userId).order("created_at", { ascending: false }));
    },
    async cancelOrder(id, reason) {
      unwrap(await db.rpc("cancel_my_order", { p_order_id: id, p_reason: reason }));
    },
    async sendMessage({ topic, message, phone, orderNo }) {
      unwrap(await db.rpc("send_support_message", { p_topic: topic, p_message: message, p_phone: phone, p_order_no: orderNo }));
    },
    async messages() {
      return unwrap(await db.from("support_messages").select("*").order("created_at", { ascending: false }).limit(200));
    },
    async resolveMessage(id) {
      unwrap(await db.from("support_messages").update({ status: "resolved" }).eq("id", id));
    },
    async deleteProduct(id) {
      unwrap(await db.from("products").delete().eq("id", id));
    },
    async allOrders() {
      return unwrap(await db.from("orders").select(orderSelect).order("created_at", { ascending: false }).limit(300));
    },
    async updateOrder(id, status, tracking, note, reason) {
      unwrap(await db.rpc("owner_update_order", { p_order_id: id, p_status: status, p_tracking: tracking ?? null, p_note: note ?? null, p_reason: reason ?? null }));
    },
    async saveProduct({ id, ...values }) {
      values.updated_at = new Date().toISOString();
      if (id) unwrap(await db.from("products").update(values).eq("id", id));
      else unwrap(await db.from("products").insert(values));
    },
    async upload(file, slug) {
      const ext = UPLOAD_TYPES[file.type];
      if (!ext) throw new Error(`${file.name} must be a PNG, JPG, WebP or SVG image.`);
      if (file.size > MAX_UPLOAD) throw new Error(`${file.name} is larger than 15 MB. Please choose a smaller image.`);
      // Reading the file first means a file the browser cannot open gets its own clear message.
      let bytes;
      try {
        bytes = await file.arrayBuffer();
      } catch {
        throw new Error(`The browser could not open ${file.name}. Copy it to your Desktop, then choose it again.`);
      }
      const body = new Blob([bytes], { type: file.type });
      const path = `${slug}/${crypto.randomUUID()}.${ext}`;
      const send = () => db.storage.from("product-media").upload(path, body, { contentType: file.type });
      let result = await send();
      if (result.error?.message === "Failed to fetch") result = await send();
      if (result.error?.message === "Failed to fetch") throw new Error(`${file.name} could not be sent. Check your connection, pause any ad blocker for this page, and try again.`);
      unwrap(result);
      return db.storage.from("product-media").getPublicUrl(path).data.publicUrl;
    },
    async team() {
      return unwrap(await db.from("co_owners").select("*").order("created_at"));
    },
    async addCoOwner(values) {
      unwrap(await db.from("co_owners").insert(values));
    },
    async updateCoOwner(email, values) {
      unwrap(await db.from("co_owners").update(values).eq("email", email));
    },
    async removeCoOwner(email) {
      unwrap(await db.from("co_owners").delete().eq("email", email));
    },
  };
}

export const api = DEMO ? await (await import("./demo.js")).demoApi() : await liveApi();
