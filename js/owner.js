import { api } from "./api.js";
import { esc, money, when, toast, openModal, pickReason, tee, STATUS, PAYMENT, paidLater } from "./ui.js";
import { OWNER_REASONS } from "./reasons.js";
import { countUp } from "./motion.js";

export async function pendingCount() {
  const orders = await api.allOrders();
  return orders.filter((o) => o.status === "pending").length;
}

const GROUPS = [
  ["new", "New", ["pending"]],
  ["production", "In production", ["accepted", "printing"]],
  ["shipped", "Shipped", ["dispatched"]],
  ["closed", "Closed", ["delivered", "rejected", "cancelled"]],
];
const NEXT = {
  pending: [["accepted", "Accept order", "primary"], ["rejected", "Decline", ""]],
  accepted: [["printing", "Send to print", "primary"], ["rejected", "Decline", ""]],
  printing: [["dispatched", "Mark dispatched by hand", ""]],
  dispatched: [["delivered", "Mark delivered", "primary"]],
};

let orderTab = "new";

const fileLink = (href, label) => (href ? `<a class="file" href="${esc(href)}" download target="_blank" rel="noopener">${label}</a>` : "");

const canAccept = (order) => ["cod", "verified"].includes(order.payment_status);

function paymentBox(order) {
  const later = paidLater(order);
  const methods = { cod: "Cash on delivery", prepaid: "Full UPI payment", advance: "UPI advance" };
  const actions = {
    submitted: `<p class="muted small">Check your bank or UPI app for this exact amount and reference before confirming.</p>
      <div class="row"><button class="btn small primary" data-pay="verify" data-id="${esc(order.id)}">Money received</button><button class="btn small danger" data-pay="fail" data-id="${esc(order.id)}">Not received</button></div>`,
    refund_due: `<p class="reason-note">Refund ${money(order.amount_due_now)} to this customer, then mark it done.</p>
      <div class="row"><button class="btn small primary" data-pay="refunded" data-id="${esc(order.id)}">Refund sent</button></div>`,
  };
  return `<div class="pay-box">
    <div class="row-between"><span>${methods[order.payment_method]}</span><span class="pay-state ${esc(order.payment_status)}">${PAYMENT[order.payment_status]}</span></div>
    ${order.amount_due_now ? `<p class="small">UPI: <strong>${money(order.amount_due_now)}</strong>${order.upi_ref ? ` · Ref <code>${esc(order.upi_ref)}</code>` : ""}</p>` : ""}
    ${later && !["rejected", "cancelled"].includes(order.status) ? `<p class="small">Collect at delivery: <strong>${money(later)}</strong></p>` : ""}
    ${actions[order.payment_status] || ""}
    ${order.status === "pending" && !canAccept(order) ? '<p class="muted small">You can accept this order once the payment is confirmed.</p>' : ""}
  </div>`;
}

function orderCard(order) {
  const digits = order.phone.replace(/\D/g, "").slice(-10);
  return `<article class="panel order">
    <header class="row-between">
      <div><span class="mono">${esc(order.order_no)}</span><p class="muted small">${when(order.created_at)}</p></div>
      <span class="status ${order.status}">${STATUS[order.status].label}</span>
    </header>
    ${order.order_items.map((item) => `<div class="line slim">
      <div class="thumb">${tee(item, "back")}</div>
      <div class="grow"><h3>${esc(item.name)}</h3><p class="mono muted">Size ${esc(item.size)} × ${item.quantity}</p>
        <div class="files">${fileLink(item.print_file_back, "Back print")}${fileLink(item.print_file_front, "Front print")}</div></div>
      <span>${money(item.unit_price_inr * item.quantity)}</span>
    </div>`).join("")}
    <div class="ship">
      <p><strong>${esc(order.customer_name)}</strong><br>${esc(order.address_line)}<br>${esc(order.city)}, ${esc(order.state)} ${esc(order.pincode)}</p>
      <p class="contact"><a href="tel:+91${digits}">+91 ${digits}</a> <a href="https://wa.me/91${digits}" target="_blank" rel="noopener">WhatsApp</a></p>
      ${order.customer_note ? `<p class="muted">Note: ${esc(order.customer_note)}</p>` : ""}
      ${order.tracking_no ? `<p class="mono small">Tracking: ${esc(order.tracking_no)}${order.courier_name ? ` · ${esc(order.courier_name)}` : ""}${order.shipping_status ? ` · ${esc(order.shipping_status)}` : ""}</p>` : ""}
      ${order.pickup_location ? `<p class="small muted">Pickup from ${esc(order.pickup_location)}</p>` : ""}
      ${order.shipping_label_url ? `<p class="small"><a class="file" href="${esc(order.shipping_label_url)}" target="_blank" rel="noopener">Download shipping label</a></p>` : ""}
      ${order.cancel_reason ? `<p class="reason-note">${order.status === "cancelled" ? "Customer's reason" : "Declined"}: ${esc(order.cancel_reason)}</p>` : ""}
    </div>
    <p class="row-between total"><span>Total</span><strong>${money(order.total_inr)}</strong></p>
    ${paymentBox(order)}
    <div class="row">${order.status === "printing" && !order.tracking_no ? `<button class="btn small primary" data-ship="${esc(order.id)}">Ship with Shiprocket</button>` : ""}${(NEXT[order.status] || []).filter(([status]) => status !== "accepted" || canAccept(order)).map(([status, label, kind]) => `<button class="btn small ${kind}" data-order="${esc(order.id)}" data-status="${status}">${label}</button>`).join("")}</div>
  </article>`;
}

function shipWithCourier(orderId, ctx) {
  openModal(`<h2>Ship this order</h2><div id="ship-body"></div>`, (modal, close) => {
    const area = modal.querySelector("#ship-body");
    const showError = (message) => { area.innerHTML = `<p class="error">${esc(message)}</p>`; };
    let latest = 0;
    const load = async (pickupName) => {
      const request = ++latest;
      area.innerHTML = '<p class="muted">Finding couriers...</p>';
      let quote;
      try {
        quote = await api.shipRates(orderId, pickupName);
      } catch (error) {
        if (request === latest) showError(error.message);
        return;
      }
      if (request !== latest) return;
      const options = quote.pickups.map((p) => `<option value="${esc(p.name)}" ${p.name === quote.pickup ? "selected" : ""}>${esc(p.name)}${p.city ? `, ${esc(p.city)}` : ""} (${esc(p.pin)})</option>`).join("");
      area.innerHTML = `<label class="field ship-pickup"><span>Pickup from</span><select id="ship-from" ${quote.locked ? "disabled" : ""}>${options}</select></label>
        ${quote.locked ? '<p class="muted small">This shipment was already created from this location.</p>' : ""}
        <p class="muted small">Courier collects <strong>${quote.collect ? money(quote.collect) : "nothing, already paid"}</strong>. The price is taken from your Shiprocket wallet.</p>
        ${quote.couriers.length ? `<div class="couriers">${quote.couriers.map((c) => `<button class="courier" data-courier="${c.id}" data-name="${esc(c.name)}" data-rate="${c.rate}">
          <span><strong>${esc(c.name)}</strong>${c.recommended ? ' <em class="rec">Recommended</em>' : ""}<small class="muted">${c.days ? `About ${esc(c.days)} days` : esc(c.etd || "")}${c.rating ? ` · Rated ${esc(c.rating)}` : ""}</small></span><b>${money(c.rate)}</b></button>`).join("")}</div>` : '<p class="error">No courier can deliver from this location to this PIN code right now.</p>'}`;
      area.querySelector("#ship-from").addEventListener("change", (event) => load(event.target.value));
      area.querySelectorAll("[data-courier]").forEach((button) => button.addEventListener("click", () => bookCourier(button, quote.pickup)));
    };
    const bookCourier = async (button, pickupName) => {
      if (!confirm(`Book ${button.dataset.name} from ${pickupName} for ${money(button.dataset.rate)}? This charges your Shiprocket wallet.`)) return;
      area.innerHTML = '<p class="muted">Booking the shipment...</p>';
      try {
        const result = await api.shipBook(orderId, Number(button.dataset.courier), pickupName);
        close();
        toast(`Booked with ${result.courier}. Tracking ${result.awb}`);
        result.warnings.forEach((warning) => toast(warning, "bad"));
        orderTab = "shipped";
        await ctx.refresh();
        await ctx.redraw();
      } catch (error) {
        showError(error.message);
      }
    };
    load("");
  });
}

function askTracking() {
  return new Promise((resolve) => {
    openModal(`<h2>Dispatch order</h2><form id="track" class="form">
      <label class="field"><span>Courier and tracking number (optional)</span><input name="tracking" maxlength="120"></label>
      <button class="btn primary wide">Mark dispatched</button></form>`, (modal, close) => {
      modal.querySelector("#track").addEventListener("submit", (event) => {
        event.preventDefault();
        const tracking = new FormData(event.target).get("tracking");
        close();
        resolve(tracking);
      });
    });
  });
}

function drawOrders(body, orders, ctx) {
  const group = GROUPS.find(([key]) => key === orderTab);
  const shown = orders.filter((o) => group[2].includes(o.status));
  body.innerHTML = `<div class="chips">${GROUPS.map(([key, label, statuses]) => {
    const count = orders.filter((o) => statuses.includes(o.status)).length;
    return `<button class="chip ${key === orderTab ? "on" : ""}" data-tab="${key}">${label} ${count}</button>`;
  }).join("")}<button class="chip" id="reload">Refresh</button></div>
  <div class="orders">${shown.map(orderCard).join("") || '<p class="muted">No orders here.</p>'}</div>`;
  body.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    orderTab = b.dataset.tab;
    drawOrders(body, orders, ctx);
  }));
  body.querySelector("#reload").addEventListener("click", ctx.redraw);
  body.querySelectorAll("[data-ship]").forEach((b) => b.addEventListener("click", () => shipWithCourier(b.dataset.ship, ctx)));
  body.querySelectorAll("[data-pay]").forEach((b) => b.addEventListener("click", async () => {
    const { pay, id } = b.dataset;
    const prompts = { fail: "Mark this payment as not received? The customer will be asked to pay again.", verify: "Have you confirmed this money in your bank or UPI app?", refunded: "Have you sent this refund?" };
    if (!confirm(prompts[pay])) return;
    try {
      await api.paymentAction(id, pay);
      toast("Payment updated");
      await ctx.refresh();
      await ctx.redraw();
    } catch (error) {
      toast(error.message, "bad");
    }
  }));
  body.querySelectorAll("[data-order]").forEach((b) => b.addEventListener("click", async () => {
    const status = b.dataset.status;
    const reason = status === "rejected"
      ? await pickReason("Why are you declining?", "Tap a reason and the order will be declined. The customer will see it.", OWNER_REASONS)
      : null;
    if (status === "rejected" && !reason) return;
    const tracking = status === "dispatched" ? await askTracking() : null;
    try {
      await api.updateOrder(b.dataset.order, status, tracking, null, reason);
      toast(`Order ${STATUS[status].label.toLowerCase()}`);
      await ctx.refresh();
      await ctx.redraw();
    } catch (error) {
      toast(error.message, "bad");
    }
  }));
}

function stats(orders) {
  const counted = orders.filter((o) => !["rejected", "cancelled"].includes(o.status));
  const tiles = [
    ["Waiting", orders.filter((o) => o.status === "pending").length],
    ["In production", orders.filter((o) => ["accepted", "printing"].includes(o.status)).length],
    ["Orders", counted.length],
    ["Order value", counted.reduce((sum, o) => sum + o.total_inr, 0), true],
  ];
  return `<div class="stats">${tiles.map(([label, value, isMoney]) => `<div class="stat"><span class="mono muted">${label}</span><strong data-n="${value}" ${isMoney ? 'data-money="1"' : ""}>${isMoney ? money(value) : value}</strong></div>`).join("")}</div>`;
}

const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function productForm(product, ctx) {
  const p = product || { name: "", tagline: "", description: "", collection: "Drop 01", price_inr: 899, compare_at_inr: null, sizes: ["S", "M", "L", "XL", "XXL"], status: "live" };
  const upload = (name, label, current) => `<label class="field"><span>${label}${current ? " (replace)" : ""}</span><input type="file" name="${name}" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label>`;
  openModal(`<h2>${product ? "Edit product" : "New product"}</h2>
    <form id="product" class="form">
      <label class="field"><span>Name</span><input name="name" required maxlength="80" value="${esc(p.name)}"></label>
      <label class="field"><span>Tagline</span><input name="tagline" maxlength="120" value="${esc(p.tagline)}"></label>
      <label class="field"><span>Description</span><textarea name="description" rows="3" maxlength="600">${esc(p.description)}</textarea></label>
      <div class="cols">
        <label class="field"><span>Price (₹)</span><input name="price_inr" type="number" min="1" step="1" required value="${p.price_inr}"></label>
        <label class="field"><span>Was price (₹, optional)</span><input name="compare_at_inr" type="number" min="1" step="1" value="${p.compare_at_inr ?? ""}"></label>
      </div>
      <div class="cols">
        <label class="field"><span>Collection</span><input name="collection" required maxlength="40" value="${esc(p.collection)}"></label>
        <label class="field"><span>Visibility</span><select name="status">
          ${[["live", "Live"], ["coming_soon", "Coming soon"], ["hidden", "Hidden"]].map(([v, l]) => `<option value="${v}" ${p.status === v ? "selected" : ""}>${l}</option>`).join("")}
        </select></label>
      </div>
      <label class="field"><span>Sizes, separated by commas</span><input name="sizes" required value="${esc(p.sizes.join(", "))}"></label>
      ${upload("back", "Back graphic (transparent PNG works best)", p.print_back)}
      ${upload("front", "Front graphic", p.print_front)}
      ${upload("model", "Model photo", p.model_image)}
      <p class="error" id="product-error" hidden></p>
      <button class="btn primary wide" id="save">Save product</button>
    </form>`, (modal, close) => {
    modal.querySelector("#product").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const errorBox = modal.querySelector("#product-error");
      const button = modal.querySelector("#save");
      const price = Number(data.get("price_inr"));
      const compare = data.get("compare_at_inr") ? Number(data.get("compare_at_inr")) : null;
      const sizes = String(data.get("sizes")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const fail = (message) => { errorBox.textContent = message; errorBox.hidden = false; };
      if (!Number.isInteger(price) || price < 1) return fail("Price must be a whole number of rupees.");
      if (!sizes.length) return fail("Add at least one size.");
      if (!product && !data.get("back").size) return fail("A new product needs a back graphic.");
      button.disabled = true;
      button.textContent = "Saving";
      try {
        const slug = p.slug || `${slugify(String(data.get("name")))}-${Date.now().toString(36)}`;
        const values = {
          name: String(data.get("name")).trim(), tagline: String(data.get("tagline")).trim(), description: String(data.get("description")).trim(),
          collection: String(data.get("collection")).trim(), price_inr: price, compare_at_inr: compare, status: data.get("status"), sizes, slug,
        };
        if (product) values.id = product.id;
        else values.sort = Math.max(0, ...ctx.store.products.map((x) => x.sort)) + 10;
        for (const side of ["back", "front"]) {
          const file = data.get(side);
          if (file.size) {
            const url = await api.upload(file, slug);
            values[`print_${side}`] = url;
            values[`print_file_${side}`] = url;
          }
        }
        if (data.get("model").size) values.model_image = await api.upload(data.get("model"), slug);
        await api.saveProduct(values);
        close();
        toast("Product saved");
        await ctx.refresh();
        await ctx.redraw();
      } catch (error) {
        fail(error.message);
        button.disabled = false;
        button.textContent = "Save product";
      }
    });
  });
}

function drawProducts(body, ctx) {
  const { products } = ctx.store;
  body.innerHTML = `<div class="row-between toolbar"><p class="muted">${products.length} products. Prices save as soon as you leave the box.</p><button class="btn small primary" id="new">Add product</button></div>
  <div class="ptable">${products.map((p) => `<div class="prow" data-id="${esc(p.id)}">
    <div class="thumb">${tee(p, "back")}</div>
    <div class="grow"><h3>${esc(p.name)}</h3><p class="mono muted">${esc(p.collection)}</p></div>
    <label class="inline"><span class="sr">Price of ${esc(p.name)}</span>₹<input class="price-input" type="number" min="1" step="1" value="${p.price_inr}"></label>
    <select class="status-input" aria-label="Visibility of ${esc(p.name)}">${[["live", "Live"], ["coming_soon", "Coming soon"], ["hidden", "Hidden"]].map(([v, l]) => `<option value="${v}" ${p.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <div class="row-actions"><button class="btn small edit">Edit</button>${ctx.store.profile.access.owner ? '<button class="btn small danger delete">Delete</button>' : ""}</div>
  </div>`).join("")}</div>`;
  body.querySelector("#new").addEventListener("click", () => productForm(null, ctx));
  body.querySelectorAll(".prow").forEach((row) => {
    const product = products.find((p) => p.id === row.dataset.id);
    const save = async (patch, message) => {
      try {
        await api.saveProduct({ id: product.id, ...patch });
        Object.assign(product, patch);
        toast(message);
      } catch (error) {
        toast(error.message, "bad");
      }
    };
    row.querySelector(".edit").addEventListener("click", () => productForm(product, ctx));
    row.querySelector(".delete")?.addEventListener("click", async () => {
      if (!confirm(`Delete ${product.name} permanently? It will disappear from the shop. Past orders keep their details. This cannot be undone.`)) return;
      try {
        await api.deleteProduct(product.id);
        toast(`${product.name} deleted`);
        await ctx.refresh();
        await ctx.redraw();
      } catch (error) {
        toast(error.message, "bad");
      }
    });
    row.querySelector(".price-input").addEventListener("change", (event) => {
      const price = Number(event.target.value);
      if (!Number.isInteger(price) || price < 1) {
        event.target.value = product.price_inr;
        return toast("Price must be a whole number of rupees", "bad");
      }
      save({ price_inr: price }, `${product.name} is now ${money(price)}`);
    });
    row.querySelector(".status-input").addEventListener("change", (event) => save({ status: event.target.value }, `${product.name} updated`));
  });
}

function drawSettings(body, ctx) {
  const s = ctx.store.settings;
  const text = (name, label, hint = "") => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(s[name] || "")}" placeholder="${esc(hint)}"></label>`;
  body.innerHTML = `<form id="settings" class="panel form store-form">
    <h3>Shipping</h3>
    <div class="cols">
      <label class="field"><span>Shipping fee (₹)</span><input name="shipping_inr" type="number" min="0" step="1" required value="${s.shipping_inr}"></label>
      <label class="field"><span>Free shipping over (₹)</span><input name="free_shipping_over" type="number" min="0" step="1" required value="${s.free_shipping_over}"></label>
    </div>
    ${text("delivery_note", "Delivery time, shown to customers", "Example: Delivered in 5 to 7 working days")}
    <h3>Parcel for Shiprocket</h3>
    ${text("pickup_location", "Default pickup location name", "Leave blank to use your primary Shiprocket location")}
    <div class="cols">
      <label class="field"><span>Packed weight (kg)</span><input name="parcel_weight_kg" type="number" min="0.01" step="0.01" required value="${s.parcel_weight_kg ?? 0.25}"></label>
      <label class="field"><span>Length (cm)</span><input name="parcel_length_cm" type="number" min="1" step="0.1" required value="${s.parcel_length_cm ?? 30}"></label>
    </div>
    <div class="cols">
      <label class="field"><span>Breadth (cm)</span><input name="parcel_breadth_cm" type="number" min="1" step="0.1" required value="${s.parcel_breadth_cm ?? 25}"></label>
      <label class="field"><span>Height (cm)</span><input name="parcel_height_cm" type="number" min="1" step="0.1" required value="${s.parcel_height_cm ?? 3}"></label>
    </div>
    <h3>Payments</h3>
    <p class="muted small">Add a UPI ID to offer full and advance UPI payment. Customers will see it, so avoid an ID that contains your personal mobile number.</p>
    <div class="cols">${text("upi_id", "UPI ID", "yourbrand@okaxis")}${text("upi_payee", "Name shown in UPI apps", "AfterHours")}</div>
    <label class="field"><span>Your UPI QR image (recommended). Use the QR from your UPI or bank app. Without it, customers pay using your UPI ID.</span><input type="file" name="upi_qr_file" accept="image/png,image/jpeg,image/webp"></label>
    ${s.upi_qr_url ? `<div class="qr-current"><div class="qr"><img src="${esc(s.upi_qr_url)}" alt="Current UPI QR code"></div><label class="check"><input type="checkbox" name="remove_upi_qr"><span><strong>Remove this QR image</strong></span></label></div>` : ""}
    <div class="cols">
      <label class="field"><span>Advance amount (₹)</span><input name="advance_inr" type="number" min="1" step="1" required value="${s.advance_inr ?? 99}"></label>
      <label class="field"><span>Discount for paying in full (%)</span><input name="prepaid_discount_pct" type="number" min="0" max="50" step="1" required value="${s.prepaid_discount_pct ?? 0}"></label>
    </div>
    <label class="check"><input type="checkbox" name="cod_enabled" ${s.cod_enabled !== false ? "checked" : ""}><span><strong>Offer full cash on delivery</strong><small class="muted">Turn off to require full or advance UPI payment. Needs a UPI ID.</small></span></label>
    <h3>Helpline</h3>
    <p class="muted small">These appear publicly on the Help page and side menu. Blank items stay hidden.</p>
    <div class="cols">${text("support_phone", "Helpline and WhatsApp number", "10-digit mobile number")}${text("support_email", "Support email", "help@yourbrand.com")}</div>
    <div class="cols">${text("support_hours", "Support hours", "Example: Mon to Sat, 10 am to 7 pm")}${text("instagram_url", "Instagram link", "https://instagram.com/yourpage")}</div>
    <h3>Trust details</h3>
    <label class="field"><span>Business address</span><textarea name="business_address" rows="2" maxlength="300" placeholder="Shown as seller details on the Help page and footer">${esc(s.business_address || "")}</textarea></label>
    <label class="field"><span>Return and exchange policy</span><textarea name="return_policy" rows="4" maxlength="1200" placeholder="Example: Damaged or wrongly printed tees are replaced if you contact us within 3 days of delivery.">${esc(s.return_policy || "")}</textarea></label>
    <p class="error" id="settings-error" hidden></p>
    <button class="btn primary wide">Save store info</button></form>`;
  body.querySelector("#settings").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { upi_qr_file: qrFile, remove_upi_qr: removeQr, ...data } = Object.fromEntries(new FormData(event.target));
    const box = body.querySelector("#settings-error");
    box.hidden = true;
    if (data.instagram_url && !data.instagram_url.startsWith("https://")) {
      box.textContent = "The Instagram link must start with https://";
      box.hidden = false;
      return;
    }
    if (data.support_phone && !/^(\+?91)?[6-9][0-9]{9}$/.test(data.support_phone.replace(/[\s-]/g, ""))) {
      box.textContent = "Please enter a valid 10-digit helpline number.";
      box.hidden = false;
      return;
    }
    const upi = data.upi_id.trim();
    if (upi && !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(upi)) {
      box.textContent = "Please enter a valid UPI ID, for example yourbrand@okaxis.";
      box.hidden = false;
      return;
    }
    if (!upi && !data.cod_enabled) {
      box.textContent = "Keep cash on delivery on until you add a UPI ID, or customers can't order.";
      box.hidden = false;
      return;
    }
    try {
      const values = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
      let qrUrl = removeQr ? "" : (s.upi_qr_url || "");
      if (qrFile?.size) qrUrl = await api.upload(qrFile, "upi-qr");
      await api.saveSettings({
        ...values,
        upi_qr_url: qrUrl,
        upi_payee: values.upi_payee || "AfterHours",
        cod_enabled: Boolean(data.cod_enabled),
        parcel_weight_kg: Number(data.parcel_weight_kg),
        parcel_length_cm: Number(data.parcel_length_cm),
        parcel_breadth_cm: Number(data.parcel_breadth_cm),
        parcel_height_cm: Number(data.parcel_height_cm),
        advance_inr: Number(data.advance_inr),
        prepaid_discount_pct: Number(data.prepaid_discount_pct),
        shipping_inr: Number(data.shipping_inr),
        free_shipping_over: Number(data.free_shipping_over),
      });
      await ctx.refresh();
      await ctx.redraw();
      toast("Store info saved");
    } catch (error) {
      toast(error.message, "bad");
    }
  });
}

const PERMISSIONS = [
  ["can_orders", "Orders", "Accept and ship orders. Can see customer names, phones and addresses."],
  ["can_products", "Products", "Add products, upload images and change prices."],
  ["can_settings", "Store info", "Change shipping, helpline details and policies."],
];

const permissionBoxes = (member) => PERMISSIONS.map(([key, label, hint]) => `<label class="check" title="${esc(hint)}">
  <input type="checkbox" name="${key}" ${member[key] ? "checked" : ""}><span><strong>${label}</strong><small class="muted">${hint}</small></span></label>`).join("");

async function drawTeam(body, ctx) {
  const members = await api.team();
  body.innerHTML = `<div class="team">
    <form id="add-member" class="panel form">
      <h3>Add a co-owner</h3>
      <p class="muted small">Enter their Google address and choose what they can do. They sign in on this same page. Only you can manage this list.</p>
      <label class="field"><span>Google email</span><input name="email" type="email" required autocomplete="off" placeholder="name@gmail.com"></label>
      <div class="checks">${permissionBoxes({ can_orders: true })}</div>
      <p class="error" id="team-error" hidden></p>
      <button class="btn primary wide">Add co-owner</button>
    </form>
    <div class="stack">${members.map((m) => `<article class="panel member" data-email="${esc(m.email)}">
      <header class="row-between"><strong class="member-email">${esc(m.email)}</strong><button class="btn small remove">Remove</button></header>
      <div class="checks">${permissionBoxes(m)}</div>
    </article>`).join("") || '<p class="muted">No co-owners yet.</p>'}</div>
  </div>`;

  body.querySelector("#add-member").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const email = form.elements.email.value.trim().toLowerCase();
    const errorBox = body.querySelector("#team-error");
    const fail = (message) => { errorBox.textContent = message; errorBox.hidden = false; };
    errorBox.hidden = true;
    if (email === ctx.store.profile.email?.toLowerCase()) return fail("That is your own account, and you already have full access.");
    if (members.some((m) => m.email === email)) return fail("That person is already a co-owner.");
    const permissions = Object.fromEntries(PERMISSIONS.map(([key]) => [key, form.elements[key].checked]));
    if (!Object.values(permissions).some(Boolean)) return fail("Choose at least one area they can access.");
    try {
      await api.addCoOwner({ email, ...permissions });
      toast(`${email} added`);
      await drawTeam(body, ctx);
    } catch (error) {
      fail(error.message);
    }
  });

  body.querySelectorAll(".member").forEach((card) => {
    const { email } = card.dataset;
    card.querySelectorAll("input[type=checkbox]").forEach((box) => box.addEventListener("change", async () => {
      try {
        await api.updateCoOwner(email, { [box.name]: box.checked });
        toast("Access updated");
      } catch (error) {
        box.checked = !box.checked;
        toast(error.message, "bad");
      }
    }));
    card.querySelector(".remove").addEventListener("click", async () => {
      if (!confirm(`Remove ${email}? They will lose console access straight away.`)) return;
      try {
        await api.removeCoOwner(email);
        toast(`${email} removed`);
        await drawTeam(body, ctx);
      } catch (error) {
        toast(error.message, "bad");
      }
    });
  });
}

async function drawHelpDesk(body, ctx) {
  const messages = await api.messages();
  const card = (m) => {
    const digits = (m.phone || "").replace(/\D/g, "").slice(-10);
    return `<article class="panel order">
      <header class="row-between"><div><strong>${esc(m.topic)}</strong><p class="muted small">${when(m.created_at)}${m.order_no ? ` · ${esc(m.order_no)}` : ""}</p></div>
      <span class="status ${m.status === "open" ? "pending" : "delivered"}">${m.status === "open" ? "Open" : "Resolved"}</span></header>
      <p class="message-text">${esc(m.message)}</p>
      <p class="contact small">${esc(m.customer_name)} · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>${digits ? ` · <a href="tel:+91${digits}">+91 ${digits}</a> <a href="https://wa.me/91${digits}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</p>
      ${m.status === "open" ? `<div class="row"><button class="btn small primary" data-resolve="${esc(m.id)}">Mark resolved</button></div>` : ""}
    </article>`;
  };
  body.innerHTML = `<div class="orders">${messages.map(card).join("") || '<p class="muted">No messages yet.</p>'}</div>`;
  body.querySelectorAll("[data-resolve]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await api.resolveMessage(button.dataset.resolve);
      toast("Marked as resolved");
      await ctx.refresh();
      await ctx.redraw();
    } catch (error) {
      toast(error.message, "bad");
    }
  }));
}

export const consoleTabs = (access) => [
  ["orders", "Orders", access.orders, "orders"],
  ["products", "Products", access.products, "tag"],
  ["help", "Help desk", access.orders, "chat"],
  ["settings", "Store info", access.settings, "settings"],
  ["team", "Team", access.owner, "team"],
].filter(([, , allowed]) => allowed);

export async function renderOwner(app, tab, ctx) {
  const { access } = ctx.store.profile;
  const tabs = consoleTabs(access);
  const active = tabs.some(([key]) => key === tab) ? tab : tabs[0][0];
  const openedAt = location.hash;
  const orders = access.orders ? await api.allOrders() : [];
  if (location.hash !== openedAt) return;
  app.innerHTML = `<section class="section first">
    <div class="head"><span class="mono kicker">${access.owner ? "Owner console" : "Co-owner console"}</span><h2>Run the shop</h2></div>
    ${access.orders ? stats(orders) : ""}
    <div class="tabs">${tabs.map(([key, label]) => `<a class="${key === active ? "on" : ""}" href="#/${key}">${label}</a>`).join("")}</div>
    <div id="owner-body"></div>
  </section>`;
  countUp(app);
  const body = document.getElementById("owner-body");
  if (active === "products") drawProducts(body, ctx);
  else if (active === "settings") drawSettings(body, ctx);
  else if (active === "team") await drawTeam(body, ctx);
  else if (active === "help") await drawHelpDesk(body, ctx);
  else drawOrders(body, orders, ctx);
}
