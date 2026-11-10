import { api, DEMO } from "./api.js";
import { esc, money, when, toast, openModal, pickReason, tee, STATUS, PAYMENT, paidLater, GOOGLE_ICON } from "./ui.js";
import { pageSwap, reveal, bindTilt, flyToBag, markLogin, consumeLogin, playLogin, playOrderPlaced } from "./motion.js";
import { mountSide, drawSide, sideToggle } from "./side.js";
import { CUSTOMER_REASONS, SUPPORT_TOPICS } from "./reasons.js";

const app = document.getElementById("app");
const store = { profile: null, products: [], settings: { shipping_inr: 79, free_shipping_over: 1499 }, activeOrders: 0 };
const INDIAN_MOBILE = /^[6-9][0-9]{9}$/;

/* ---------- bag ---------- */
const BAG_KEY = "afterhours-bag";
const readBag = () => {
  try { return JSON.parse(localStorage.getItem(BAG_KEY) || "[]"); } catch { return []; }
};
let bag = readBag();
const writeBag = () => {
  try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch { /* the bag still works for this visit */ }
  drawNav();
};
const bagCount = () => bag.reduce((sum, line) => sum + line.quantity, 0);
const bagLines = () => bag
  .map((line) => ({ ...line, product: store.products.find((p) => p.id === line.product_id) }))
  .filter((line) => line.product?.status === "live");

function addToBag(productId, size) {
  const line = bag.find((l) => l.product_id === productId && l.size === size);
  if (line) line.quantity = Math.min(10, line.quantity + 1);
  else bag.push({ product_id: productId, size, quantity: 1 });
  writeBag();
  toast(`Added to bag, size ${size}`);
}

function totals(lines) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.product.price_inr, 0);
  const shipping = subtotal === 0 || subtotal >= store.settings.free_shipping_over ? 0 : store.settings.shipping_inr;
  return { subtotal, shipping, total: subtotal + shipping };
}

/* ---------- sign in ---------- */
function signInModal(reason = "Sign in to place orders and track them.") {
  const label = DEMO ? "Enter practice store" : `${GOOGLE_ICON} Continue with Google`;
  openModal(`<img class="modal-logo spray" src="assets/brand/logo-small.webp" alt="AfterHours">
    <h2 class="clock-title">Clock in</h2><p class="muted">${esc(reason)}</p>
    <button class="btn google wide shine" id="google-signin">${label}</button>`, (modal, close) => {
    const button = modal.querySelector("#google-signin");
    button.addEventListener("click", async () => {
      markLogin();
      button.disabled = true;
      button.classList.add("working");
      try {
        await api.signIn("customer");
        if (DEMO) close();
      } catch (error) {
        consumeLogin();
        toast(error.message, "bad");
        button.disabled = false;
        button.classList.remove("working");
      }
    });
  });
}

const firstName = () => (store.profile?.full_name || store.profile?.email || "there").split(/[\s@]/)[0];

/* ---------- shell ---------- */
function drawNav() {
  const signedIn = Boolean(store.profile);
  document.getElementById("nav").innerHTML = `<nav class="nav">
    <div class="nav-left">${sideToggle()}<a class="brand" href="#/" aria-label="AfterHours home"><img src="assets/brand/logo-small.webp" alt="AfterHours"></a></div>
    <div class="links">
      <a href="#/shop">Shop</a>
      <a class="nav-help" href="#/help">Help</a>
      <a class="bag-link" href="#/bag">Bag<b class="pill">${bagCount()}</b></a>
      ${signedIn
        ? `<button class="link" id="sign-out">Sign out</button>`
        : `<button class="btn small primary" id="sign-in">Sign in</button>`}
    </div>
  </nav>`;
  document.getElementById("sign-in")?.addEventListener("click", () => signInModal());
  document.getElementById("sign-out")?.addEventListener("click", leave);
  drawCustomerSide();
}

async function leave() {
  await api.signOut();
  location.hash = "#/";
}

const shippingText = () => {
  const { shipping_inr: fee, free_shipping_over: free } = store.settings;
  return fee ? `${money(fee)}, free over ${money(free)}` : "Free";
};

const hasUpi = () => Boolean(store.settings.upi_id);
const hasCod = () => store.settings.cod_enabled !== false;
const paymentText = () => (hasUpi() && hasCod() ? "UPI or cash on delivery" : hasUpi() ? "UPI" : "Cash on delivery");

function drawCustomerSide() {
  const s = store.settings;
  const info = [{ label: "Payment", value: paymentText() }, { label: "Shipping", value: shippingText() }];
  if (s.support_phone) info.push({ label: "Helpline", value: s.support_phone, href: `tel:${s.support_phone.replace(/\s/g, "")}` });
  if (s.support_hours) info.push({ label: "Support hours", value: s.support_hours });
  drawSide({
    account: store.profile && { name: store.profile.full_name, email: store.profile.email, tag: store.profile.email },
    links: [
      { href: "#/", label: "Home", icon: "home" },
      { href: "#/shop", label: "Shop all graphics", icon: "shop" },
      { href: "#/bag", label: "My bag", icon: "bag", badge: bagCount() || "" },
      { href: "#/orders", label: "My orders", icon: "orders", badge: store.activeOrders || "" },
      { href: "#/help", label: "Help and contact", icon: "help" },
      { href: "privacy.html", label: "Privacy policy", icon: "shield" },
    ],
    info,
    signIn: () => signInModal(),
    signOut: leave,
  });
}

function drawFooter() {
  const s = store.settings;
  document.getElementById("footer").innerHTML = `<div class="foot">
    <img src="assets/brand/logo-small.webp" alt="AfterHours Streetwear Co.">
    <div class="foot-text">
      <p class="mono muted">Every tee is printed after you order it.</p>
      ${s.business_address ? `<p class="muted small">AfterHours Streetwear Co., ${esc(s.business_address)}</p>` : ""}
    </div>
    <nav class="foot-links" aria-label="Footer">
      <a class="foot-link" href="#/help">Help and contact</a>
      <a class="foot-link" href="privacy.html">Privacy Policy</a>
      ${s.instagram_url ? `<a class="foot-link" href="${esc(s.instagram_url)}" target="_blank" rel="noopener">Instagram</a>` : ""}
    </nav>
  </div>`;
}

const paymentTrust = () => {
  if (hasUpi() && hasCod()) return ["Pay your way", "Pay by UPI, or cash when it arrives."];
  if (hasUpi()) return ["Pay by UPI", "We confirm your payment before printing."];
  return ["Pay when it arrives", "Cash on delivery. No card or UPI needed to order."];
};

const trustItems = () => [
  paymentTrust(),
  ["Printed just for you", "Your tee goes to print after your order is accepted."],
  ["Cancel before we accept", "Cancel an unpaid order yourself, or contact us about a paid one."],
  ["Follow every step", "See it move from accepted to printing to delivered."],
  ["Safe Google sign-in", "We never see or store your Google password."],
];

const trustStrip = () => `<section class="trust" aria-label="Why shop with AfterHours">${trustItems().map(([title, text]) => `<div><strong>${title}</strong><span class="muted">${text}</span></div>`).join("")}</section>`;

/* ---------- catalogue pieces ---------- */
function card(p) {
  const off = p.compare_at_inr > p.price_inr ? Math.round((1 - p.price_inr / p.compare_at_inr) * 100) : 0;
  const soon = p.status === "coming_soon";
  return `<a class="card" href="#/p/${esc(p.slug)}">
    <div class="card-art">
      <span class="tag mono">${esc(soon ? "Coming soon" : p.collection)}</span>
      <div class="flip"><div class="side a">${tee(p, "back")}</div><div class="side b">${tee(p, "front")}</div></div>
    </div>
    <div class="card-info">
      <h3>${esc(p.name)}</h3>
      <p class="muted">${esc(p.tagline)}</p>
      <p class="price">${money(p.price_inr)}${off ? ` <s>${money(p.compare_at_inr)}</s> <em>${off}% off</em>` : ""}</p>
    </div>
  </a>`;
}

const visible = () => store.products.filter((p) => p.status !== "hidden");
const grid = (items) => `<div class="grid">${items.map(card).join("") || '<p class="muted">Nothing here yet.</p>'}</div>`;

function priceRow(collection) {
  const items = visible().filter((p) => p.collection === collection);
  if (!items.length) return "";
  const lowest = Math.min(...items.map((p) => p.price_inr));
  const count = `${items.length} graphic${items.length === 1 ? "" : "s"}`;
  return `<div class="tier"><span class="mono muted">${esc(collection)}</span><strong>${money(lowest)}</strong><span class="muted">Starting price, ${count}</span></div>`;
}

function pricing() {
  const collections = [...new Set(visible().map((p) => p.collection))];
  const { shipping_inr: fee, free_shipping_over: free } = store.settings;
  return `<section class="section" id="pricing">
    <div class="head"><span class="mono kicker">Pricing</span><h2>One tee. One price.</h2></div>
    <div class="tiers">${collections.map(priceRow).join("")}
      <div class="tier hot"><span class="mono">Shipping</span><strong>${fee ? money(fee) : "Free"}</strong><span>${fee ? `free on orders over ${money(free)}` : "on every order"}</span></div>
    </div>
  </section>`;
}

function lookbook() {
  const photos = Array.from({ length: 12 }, (_, i) => `assets/lookbook/${String(i + 1).padStart(2, "0")}.webp`);
  return `<section class="section">
    <div class="head"><span class="mono kicker">Lookbook</span><h2>Seen after dark.</h2></div>
    <div class="lookbook" tabindex="0" aria-label="Lookbook photos">${photos.map((src) => `<img src="${src}" alt="Model wearing an AfterHours logo tee at night" loading="lazy">`).join("")}</div>
  </section>`;
}

function howItWorks() {
  const steps = [
    ["Pick a graphic", "Choose your print and your size."],
    ["We confirm it", "Your order gets checked and accepted."],
    ["We print it", "Your tee goes to press only after you order."],
    ["It ships to you", "Track every step from your orders page."],
  ];
  return `<section class="section">
    <div class="head"><span class="mono kicker">How it works</span><h2>Printed after you order.</h2></div>
    <ol class="steps">${steps.map(([t, d], i) => `<li><span class="mono">0${i + 1}</span><h3>${t}</h3><p class="muted">${d}</p></li>`).join("")}</ol>
  </section>`;
}

/* ---------- pages ---------- */
function hero() {
  const pick = store.products.find((p) => p.slug === "neon-tokyo" && p.status !== "hidden") || visible()[0];
  const copy = !store.profile
    ? { kicker: "Streetwear for the late shift", title: "Made for<br><span>after dark.</span>", body: "Graphic tees printed the moment you order. No warehouse, no leftovers.",
        cta: `<button class="btn primary" id="hero-signin">Sign in to order</button><a class="btn" href="#/shop">Browse the drop</a>` }
    : { kicker: "You're clocked in", title: `Welcome back,<br><span>${esc(firstName())}.</span>`, body: "The latest drop is below, and your orders are one tap away.",
        cta: `<a class="btn primary" href="#/shop">Shop the drop</a><a class="btn" href="#/orders">Track orders</a>` };
  return `<section class="hero">
    <div class="hero-copy">
      <img class="hero-logo spray" src="assets/brand/logo.webp" alt="AfterHours Streetwear Co.">
      <span class="mono kicker">${copy.kicker}</span>
      <h1>${copy.title}</h1>
      <p class="lead">${copy.body}</p>
      <div class="row">${copy.cta}</div>
    </div>
    <div class="hero-art">
      <div class="hud mono"><span>REC ●</span><span>${visible().length} GRAPHICS LIVE</span></div>
      <div class="float"><div class="scan" aria-hidden="true"></div>${pick ? tee(pick, "back", true) : ""}</div>
      ${pick ? `<a class="hud-tag" href="#/p/${esc(pick.slug)}"><b>${esc(pick.name)}</b><span>${money(pick.price_inr)}</span></a>` : ""}
    </div>
  </section>`;
}

async function activeOrderStrip() {
  if (!store.profile) return "";
  const orders = await api.myOrders(store.profile.id);
  const active = orders.find((o) => ["pending", "accepted", "printing", "dispatched"].includes(o.status));
  if (!active) return "";
  return `<a class="strip" href="#/orders"><span class="mono">${esc(active.order_no)}</span><strong>${STATUS[active.status].label}</strong><span class="muted">View order</span></a>`;
}

async function pageHome() {
  const live = visible();
  const featured = live.filter((p) => p.collection === "Drop 01").slice(0, 4);
  const pre = live.filter((p) => p.collection === "Pre-Launch").slice(0, 4);
  const marquee = Array(8).fill("PRINTED TO ORDER ✦ AFTER DARK ONLY ✦ ").join("");
  app.innerHTML = `${hero()}<div id="strip"></div>
    <div class="marquee mono" aria-hidden="true"><div>${marquee}</div></div>
    ${trustStrip()}
    <section class="section"><div class="head"><span class="mono kicker">Drop 01</span><h2>The first ten.</h2><a class="more" href="#/shop">See all</a></div>${grid(featured)}</section>
    ${pre.length ? `<section class="section"><div class="head"><span class="mono kicker">Pre-Launch</span><h2>Early-access graphics.</h2><a class="more" href="#/shop">See all</a></div>${grid(pre)}</section>` : ""}
    ${lookbook()}${pricing()}${howItWorks()}`;
  document.getElementById("hero-signin")?.addEventListener("click", () => signInModal());
  const strip = await activeOrderStrip().catch(() => "");
  const slot = document.getElementById("strip");
  if (slot) slot.innerHTML = strip;
}

function pageShop(filter = "All") {
  const collections = ["All", ...new Set(visible().map((p) => p.collection))];
  const items = filter === "All" ? visible() : visible().filter((p) => p.collection === filter);
  app.innerHTML = `<section class="section first">
    <div class="head"><span class="mono kicker">The catalogue</span><h2>All graphics</h2></div>
    <div class="chips">${collections.map((c) => `<button class="chip ${c === filter ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    ${grid(items)}
  </section>`;
  app.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => pageShop(b.dataset.c)));
  reveal(app);
}

function pageProduct(slug) {
  const p = visible().find((x) => x.slug === slug);
  if (!p) return notFound();
  const views = [["back", "Back"], ["front", "Front"]];
  if (p.model_image) views.push(["model", "On model"]);
  const live = p.status === "live";
  app.innerHTML = `<section class="section first pdp">
    <div class="gallery">
      <div class="stage" id="stage">${tee(p, "back")}</div>
      <div class="chips">${views.map(([v, l], i) => `<button class="chip ${i ? "" : "on"}" data-v="${v}">${l}</button>`).join("")}</div>
    </div>
    <div class="buy">
      <span class="mono kicker">${esc(p.collection)}</span>
      <h1>${esc(p.name)}</h1>
      <p class="lead">${esc(p.tagline)}</p>
      <p class="price big">${money(p.price_inr)}${p.compare_at_inr > p.price_inr ? ` <s>${money(p.compare_at_inr)}</s>` : ""}</p>
      <p class="muted">${esc(p.description)}</p>
      ${live ? `<span class="mono label">Size</span>
      <div class="sizes">${p.sizes.map((s, i) => `<button class="size ${i === 1 ? "on" : ""}" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>
      <div class="row"><button class="btn primary" id="add">Add to bag</button><button class="btn" id="buy">Buy now</button></div>`
      : `<p class="notice mono">Coming soon</p>`}
      <ul class="assure">
        <li>Printed to order on a black tee</li>
        <li>Pay by ${esc(paymentText())} (shipping ${esc(shippingText())})</li>
        ${store.settings.delivery_note ? `<li>${esc(store.settings.delivery_note)}</li>` : ""}
        <li>Questions? <a href="#/help">Contact us</a></li>
      </ul>
    </div>
  </section>`;
  const stage = document.getElementById("stage");
  app.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => {
    app.querySelectorAll("[data-v]").forEach((x) => x.classList.toggle("on", x === b));
    stage.innerHTML = b.dataset.v === "model"
      ? `<img class="model" src="${esc(p.model_image)}" alt="${esc(p.name)} worn by a model">`
      : tee(p, b.dataset.v, true);
    stage.firstElementChild.classList.add("swap-in");
  }));
  let size = p.sizes[1] || p.sizes[0];
  app.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => {
    size = b.dataset.s;
    app.querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("on", x === b));
  }));
  document.getElementById("add")?.addEventListener("click", () => {
    addToBag(p.id, size);
    flyToBag(stage.firstElementChild);
  });
  document.getElementById("buy")?.addEventListener("click", () => { addToBag(p.id, size); location.hash = "#/checkout"; });
}

function summary(lines) {
  const { subtotal, shipping, total } = totals(lines);
  return `<dl class="sum"><dt>Subtotal</dt><dd>${money(subtotal)}</dd><dt>Shipping</dt><dd>${shipping ? money(shipping) : "Free"}</dd><dt class="t">Total</dt><dd class="t">${money(total)}</dd></dl>`;
}

function pageBag() {
  const lines = bagLines();
  if (!lines.length) {
    app.innerHTML = `<section class="section first empty"><h2>Your bag is empty.</h2><a class="btn primary" href="#/shop">Browse the drop</a></section>`;
    return;
  }
  app.innerHTML = `<section class="section first two">
    <div><div class="head"><h2>Your bag</h2></div>
      ${lines.map((l) => `<div class="line" data-p="${esc(l.product_id)}" data-s="${esc(l.size)}">
        <div class="thumb">${tee(l.product, "back")}</div>
        <div class="grow"><h3>${esc(l.product.name)}</h3><p class="mono muted">Size ${esc(l.size)}</p><p class="price">${money(l.product.price_inr)}</p></div>
        <div class="qty"><button aria-label="Fewer" data-d="-1">−</button><span>${l.quantity}</span><button aria-label="More" data-d="1">+</button></div>
      </div>`).join("")}
    </div>
    <aside class="panel">${summary(lines)}<a class="btn primary wide" href="#/checkout">Checkout</a></aside>
  </section>`;
  app.querySelectorAll(".line").forEach((row) => row.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => {
    const line = bag.find((l) => l.product_id === row.dataset.p && l.size === row.dataset.s);
    line.quantity = Math.min(10, line.quantity + Number(b.dataset.d));
    bag = bag.filter((l) => l.quantity > 0);
    writeBag();
    pageBag();
  })));
}

function needSignIn(message) {
  app.innerHTML = `<section class="section first empty"><h2>Clock in first.</h2><p class="muted">${esc(message)}</p><button class="btn primary" id="need">Sign in</button></section>`;
  document.getElementById("need").addEventListener("click", () => signInModal(message));
}

async function pageCheckout() {
  const lines = bagLines();
  if (!lines.length) return pageBag();
  if (!store.profile) return needSignIn("Sign in to finish your order. Your bag is saved.");
  const openedAt = location.hash;
  const previous = (await api.myOrders(store.profile.id).catch(() => []))[0] || {};
  if (location.hash !== openedAt) return;
  const options = paymentOptions(lines);
  const field = (name, label, value, attrs = "") => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value)}" required ${attrs}></label>`;
  app.innerHTML = `<section class="section first two">
    <form id="checkout" class="panel form" novalidate>
      <div class="head"><h2>Delivery details</h2></div>
      ${field("name", "Full name", previous.customer_name || store.profile.full_name || "", 'autocomplete="name"')}
      ${field("phone", "Mobile number", previous.phone || "", 'inputmode="tel" autocomplete="tel" placeholder="10-digit number"')}
      ${field("line", "Address", previous.address_line || "", 'autocomplete="street-address" placeholder="House, street, area"')}
      <div class="cols">${field("city", "City", previous.city || "", 'autocomplete="address-level2"')}${field("state", "State", previous.state || "", 'autocomplete="address-level1"')}</div>
      ${field("pincode", "PIN code", previous.pincode || "", 'inputmode="numeric" maxlength="6" autocomplete="postal-code"')}
      <label class="field"><span>Note (optional)</span><input name="note" maxlength="300"></label>
      <fieldset class="pay-opts"><legend>How would you like to pay?</legend>
        ${options.map((o, i) => `<label class="pay-opt"><input type="radio" name="payment" value="${o.id}" ${i ? "" : "checked"}><span><strong>${esc(o.title)}</strong><small class="muted">${esc(o.note)}</small></span></label>`).join("") || '<p class="error">Payments are unavailable right now. Please contact us.</p>'}
      </fieldset>
      <p class="error" id="form-error" hidden></p>
      <button class="btn primary wide" id="place">Place order</button>
    </form>
    <aside class="panel">
      ${lines.map((l) => `<p class="row-between"><span>${esc(l.product.name)} · ${esc(l.size)} × ${l.quantity}</span><span>${money(l.quantity * l.product.price_inr)}</span></p>`).join("")}
      <div id="pay-sum"></div>
      <ul class="assure">
        <li>We confirm every payment before your tee is printed.</li>
        <li>If we decline a paid order, we refund your payment.</li>
        <li>Your details are only used to deliver this order. <a href="privacy.html">Privacy policy</a></li>
      </ul>
    </aside>
  </section>`;
  const form = document.getElementById("checkout");
  const chosen = () => options.find((o) => o.id === form.elements.payment?.value) || options[0];
  const showSum = () => {
    const o = chosen();
    if (!o) return;
    const { subtotal, shipping } = totals(lines);
    const box = document.getElementById("pay-sum");
    box.innerHTML = `<dl class="sum"><dt>Subtotal</dt><dd>${money(subtotal)}</dd><dt>Shipping</dt><dd>${shipping ? money(shipping) : "Free"}</dd>
      ${o.discount ? `<dt>UPI discount</dt><dd>-${money(o.discount)}</dd>` : ""}
      <dt class="t">Total</dt><dd class="t">${money(o.total)}</dd>
      <dt>Pay now by UPI</dt><dd>${money(o.now)}</dd><dt>Pay at delivery</dt><dd>${money(o.total - o.now)}</dd></dl>`;
  };
  showSum();
  form.addEventListener("change", (event) => { if (event.target.name === "payment") showSum(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const errorBox = document.getElementById("form-error");
    const fail = (message) => { errorBox.textContent = message; errorBox.hidden = false; };
    errorBox.hidden = true;
    const phone = values.phone.replace(/[\s-]/g, "").replace(/^\+91/, "");
    if (values.name.trim().length < 2) return fail("Please enter your full name.");
    if (!INDIAN_MOBILE.test(phone)) return fail("Please enter a valid 10-digit mobile number.");
    if (values.line.trim().length < 8) return fail("Please enter your full address.");
    if (values.city.trim().length < 2 || values.state.trim().length < 2) return fail("Please enter your city and state.");
    if (!/^[1-9][0-9]{5}$/.test(values.pincode.trim())) return fail("Please enter a valid 6-digit PIN code.");
    if (!chosen()) return fail("Payments are unavailable right now. Please contact us.");
    const button = document.getElementById("place");
    button.disabled = true;
    button.textContent = "Placing order";
    try {
      const result = await api.placeOrder(
        lines.map((l) => ({ product_id: l.product_id, size: l.size, quantity: l.quantity })),
        { name: values.name.trim(), phone, line: values.line.trim(), city: values.city.trim(), state: values.state.trim(), pincode: values.pincode.trim() },
        values.note.trim(),
        chosen().id,
      );
      bag = [];
      writeBag();
      if (result.pay_now > 0) {
        playOrderPlaced({ orderNo: result.order_no, total: result.total_inr, note: `One last step: pay ${money(result.pay_now)} by UPI.` });
        location.hash = `#/pay/${result.order_id}`;
      } else {
        playOrderPlaced({ orderNo: result.order_no, total: result.total_inr });
        location.hash = "#/orders";
      }
    } catch (error) {
      fail(error.message);
      button.disabled = false;
      button.textContent = "Place order";
    }
  });
}

function paymentOptions(lines) {
  const s = store.settings;
  const { subtotal, shipping } = totals(lines);
  const full = subtotal + shipping;
  const options = [];
  if (hasUpi()) {
    const discount = Math.floor(subtotal * (s.prepaid_discount_pct || 0) / 100);
    options.push({ id: "prepaid", title: "Pay in full by UPI", note: discount ? `Save ${money(discount)}. Nothing to pay at delivery.` : "Nothing to pay at delivery.", discount, total: full - discount, now: full - discount });
    const advance = Math.min(s.advance_inr || 99, full);
    options.push({ id: "advance", title: `Pay ${money(advance)} advance by UPI`, note: `Pay ${money(full - advance)} in cash at delivery.`, discount: 0, total: full, now: advance });
  }
  if (hasCod()) options.push({ id: "cod", title: "Cash on delivery", note: "Pay the full amount when it arrives.", discount: 0, total: full, now: 0 });
  return options;
}

async function pagePay(orderId) {
  if (!store.profile) return needSignIn("Sign in to pay for your order.");
  const openedAt = location.hash;
  const order = (await api.myOrders(store.profile.id)).find((o) => o.id === orderId);
  if (location.hash !== openedAt) return;
  if (!order) return notFound();
  if (order.status !== "pending" || !["awaiting", "failed"].includes(order.payment_status)) {
    location.hash = "#/orders";
    return;
  }
  const s = store.settings;
  // UPI apps reject many QR codes that encode the @ or lock an amount for a
  // regular UPI ID, so this holds only the payee and the customer types the amount.
  const link = `upi://pay?pa=${s.upi_id}&pn=${encodeURIComponent(s.upi_payee || "AfterHours")}&cu=INR`;
  app.innerHTML = `<section class="section first two">
    <div class="panel pay-card">
      <span class="mono kicker">Order ${esc(order.order_no)}</span>
      <p class="pay-amount">${money(order.amount_due_now)}</p>
      ${order.payment_status === "failed" ? '<p class="error">We could not find your last payment. Please pay again, or contact us if money left your account.</p>' : ""}
      <div class="qr" id="qr">${s.upi_qr_url ? `<img src="${esc(s.upi_qr_url)}" alt="UPI QR code for AfterHours">` : ""}</div>
      <p class="pay-exact">Scan, then enter exactly <strong>${money(order.amount_due_now)}</strong></p>
      <p class="muted small">Add ${esc(order.order_no)} in the payment note if your app allows it.</p>
      <a class="btn primary wide phone-only" href="${esc(link)}">Open UPI app</a>
      <div class="upi-copy"><span class="muted small">UPI ID</span><code>${esc(s.upi_id)}</code><button type="button" class="btn small" id="copy-upi">Copy</button></div>
    </div>
    <form id="ref-form" class="panel form">
      <div class="head"><h2>Paid? Confirm it.</h2></div>
      <p class="muted">After paying, find the <strong>12-digit UPI reference number</strong> (also called UTR or transaction ID) in your payment app's receipt.</p>
      <label class="field"><span>UPI reference number</span><input name="ref" inputmode="numeric" autocomplete="off" maxlength="16" required placeholder="12 digits"></label>
      <p class="error" id="ref-error" hidden></p>
      <button class="btn primary wide" id="ref-send">Submit payment</button>
      <a class="gate-back" href="#/orders">I'll pay later</a>
      <ul class="assure"><li>We check every payment before printing your tee.</li><li>If we decline your order, we refund your payment.</li></ul>
    </form>
  </section>`;
  if (!s.upi_qr_url) try {
    const { default: qrcode } = await import("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm");
    const code = qrcode(0, "M");
    code.addData(link);
    code.make();
    document.getElementById("qr").innerHTML = code.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  } catch {
    document.getElementById("qr").innerHTML = '<p class="muted small">The QR code could not load. Please pay using the UPI ID below.</p>';
  }
  document.getElementById("copy-upi").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(s.upi_id);
      toast("UPI ID copied");
    } catch {
      toast("Could not copy. Please type the UPI ID.", "bad");
    }
  });
  document.getElementById("ref-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const box = document.getElementById("ref-error");
    const button = document.getElementById("ref-send");
    box.hidden = true;
    button.disabled = true;
    try {
      await api.submitPaymentRef(order.id, event.target.elements.ref.value.replace(/\s/g, ""));
      toast("Thanks. We'll confirm your payment soon.");
      location.hash = "#/orders";
    } catch (error) {
      box.textContent = error.message;
      box.hidden = false;
      button.disabled = false;
    }
  });
}

function timeline(status) {
  const step = STATUS[status].step;
  if (step < 0) return "";
  return `<ol class="track">${["Placed", "Accepted", "Printing", "Dispatched", "Delivered"].map((label, i) => `<li class="${i <= step ? "done" : ""}">${label}</li>`).join("")}</ol>`;
}

async function pageOrders() {
  if (!store.profile) return needSignIn("Sign in to see your orders.");
  const openedAt = location.hash;
  const orders = await api.myOrders(store.profile.id);
  if (location.hash !== openedAt) return;
  if (!orders.length) {
    app.innerHTML = `<section class="section first empty"><h2>No orders yet.</h2><a class="btn primary" href="#/shop">Browse the drop</a></section>`;
    return;
  }
  app.innerHTML = `<section class="section first"><div class="head"><h2>Your orders</h2></div>
    <div class="stack">${orders.map((o) => `<article class="panel order">
      <header class="row-between"><div><span class="mono">${esc(o.order_no)}</span><p class="muted small">${when(o.created_at)}</p></div><span class="status ${o.status}">${STATUS[o.status].label}</span></header>
      ${timeline(o.status)}
      ${o.order_items.map((i) => `<p class="row-between"><span>${esc(i.name)} · ${esc(i.size)} × ${i.quantity}</span><span>${money(i.unit_price_inr * i.quantity)}</span></p>`).join("")}
      <p class="row-between total"><span>Total</span><strong>${money(o.total_inr)}</strong></p>
      <div class="pay-line"><span class="pay-state ${esc(o.payment_status)}">${PAYMENT[o.payment_status]}</span>
        ${o.amount_due_now ? `<span class="muted small">UPI ${money(o.amount_due_now)}${paidLater(o) && !["rejected", "cancelled"].includes(o.status) ? `, then ${money(paidLater(o))} at delivery` : ""}</span>` : ""}
        ${["awaiting", "failed"].includes(o.payment_status) && o.status === "pending" ? `<a class="btn small primary" href="#/pay/${esc(o.id)}">${o.payment_status === "failed" ? "Try again" : "Pay now"}</a>` : ""}</div>
      ${o.tracking_no ? `<p class="mono small">Tracking: ${esc(o.tracking_no)}</p>` : ""}
      ${o.cancel_reason ? `<p class="reason-note">Reason: ${esc(o.cancel_reason)}</p>` : ""}
      ${o.status === "pending" && ["cod", "awaiting", "failed"].includes(o.payment_status) ? `<button class="btn small" data-cancel="${esc(o.id)}">Cancel order</button>` : ""}
      ${o.status === "pending" && ["submitted", "verified"].includes(o.payment_status) ? `<p class="muted small">Need to cancel a paid order? <a class="inline-link" href="#/help">Contact us</a></p>` : ""}
    </article>`).join("")}</div></section>`;
  reveal(app);
  app.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
    const reason = await pickReason("Why are you cancelling?", "Tap a reason and your order will be cancelled.", CUSTOMER_REASONS);
    if (!reason) return;
    try {
      await api.cancelOrder(b.dataset.cancel, reason);
      toast("Order cancelled");
      await updateActiveOrders();
      drawNav();
      pageOrders();
    } catch (error) {
      toast(error.message, "bad");
    }
  }));
}

function faq() {
  const s = store.settings;
  const items = [
    ["How do I pay?", hasUpi() && hasCod() ? "By UPI when you order, with a small advance, or in cash when your tee arrives." : hasUpi() ? "By UPI when you order. We confirm your payment before printing." : "Cash on delivery. You pay the delivery partner when your tee arrives, and there is nothing to pay online."],
    ...(hasUpi() ? [["What if my order is declined after I pay?", "We refund your UPI payment."]] : []),
    ["When is my tee printed?", "Each tee is printed after we accept your order, so it is made just for you."],
    ["Can I cancel my order?", `Yes, from your orders page, until we accept it. After that printing begins${s.support_phone || s.support_email ? ", so please contact us quickly" : ""}.`],
    ["How do I follow my order?", "Sign in and open My orders. You will see each stage, and a tracking number once it is dispatched."],
    ["What does shipping cost?", `${shippingText()}.`],
    ["Why do I sign in with Google?", "So only you can see your orders. We receive your name, email and profile picture, and never your Google password."],
  ];
  if (s.delivery_note) items.splice(2, 0, ["How long does delivery take?", s.delivery_note]);
  if (s.return_policy) items.push(["What is your return and exchange policy?", s.return_policy]);
  return items.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p class="muted">${esc(a)}</p></details>`).join("");
}

async function pageHelp() {
  const s = store.settings;
  const digits = (s.support_phone || "").replace(/\D/g, "").slice(-10);
  const ways = [
    digits && ["Call us", s.support_phone, `tel:+91${digits}`],
    digits && ["WhatsApp", "Message us on WhatsApp", `https://wa.me/91${digits}`],
    s.support_email && ["Email", s.support_email, `mailto:${s.support_email}`],
    s.instagram_url && ["Instagram", "Message our page", s.instagram_url],
  ].filter(Boolean);
  const formOrPrompt = store.profile
    ? `<form id="help-form" class="form">
        <label class="field"><span>What do you need help with?</span><select name="topic" required><option value="">Choose a topic</option>${SUPPORT_TOPICS.map((t) => `<option>${esc(t)}</option>`).join("")}</select></label>
        <label class="field"><span>Order number (optional)</span><input name="orderNo" maxlength="20" placeholder="AH-1001"></label>
        <label class="field"><span>Mobile number (optional)</span><input name="phone" inputmode="tel" autocomplete="tel" placeholder="So we can call you back"></label>
        <label class="field"><span>Your message</span><textarea name="message" rows="4" required minlength="5" maxlength="1000"></textarea></label>
        <p class="muted small">We'll reply to ${esc(store.profile.email)}${digits ? " or by phone" : ""}.</p>
        <p class="error" id="help-error" hidden></p>
        <button class="btn primary wide" id="help-send">Send message</button>
      </form>`
    : `<p class="muted">Sign in so we can link your message to your account and reply to you.</p><button class="btn primary" id="help-signin">Sign in to message us</button>`;
  app.innerHTML = `<section class="section first">
    <div class="head"><span class="mono kicker">Helpline</span><h2>We're here to help.</h2></div>
    ${s.support_hours ? `<p class="lead">Support hours: ${esc(s.support_hours)}</p>` : ""}
    ${ways.length ? `<div class="ways">${ways.map(([title, value, href]) => `<a class="way panel" href="${esc(href)}" ${href.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}><span class="mono muted">${esc(title)}</span><strong>${esc(value)}</strong></a>`).join("")}</div>` : ""}
    <div class="two help-grid">
      <div class="panel"><div class="head"><h3>Send us a message</h3></div>${formOrPrompt}</div>
      <div><div class="head"><h3>Common questions</h3></div>${faq()}</div>
    </div>
    ${s.business_address ? `<div class="panel seller"><span class="mono muted">Seller details</span><p><strong>AfterHours Streetwear Co.</strong><br>${esc(s.business_address)}</p></div>` : ""}
  </section>`;
  document.getElementById("help-signin")?.addEventListener("click", () => signInModal("Sign in to send us a message."));
  const form = document.getElementById("help-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const box = document.getElementById("help-error");
    const button = document.getElementById("help-send");
    box.hidden = true;
    button.disabled = true;
    try {
      await api.sendMessage(values);
      form.reset();
      toast("Message sent. We'll get back to you.");
    } catch (error) {
      box.textContent = error.message;
      box.hidden = false;
    }
    button.disabled = false;
  });
}

function notFound() {
  app.innerHTML = `<section class="section first empty"><h2>Nothing out here.</h2><a class="btn primary" href="#/">Back home</a></section>`;
}

/* ---------- router ---------- */
async function route() {
  const [, page = "", arg = ""] = (location.hash || "#/").split("/");
  await pageSwap(app, async () => {
    window.scrollTo({ top: 0, behavior: "instant" });
    try {
      if (page === "") await pageHome();
      else if (page === "shop") pageShop();
      else if (page === "p") pageProduct(arg);
      else if (page === "bag") pageBag();
      else if (page === "checkout") await pageCheckout();
      else if (page === "orders") await pageOrders();
      else if (page === "help") await pageHelp();
      else if (page === "pay") await pagePay(arg);
      else notFound();
    } catch (error) {
      app.innerHTML = `<section class="section first empty"><h2>Something went wrong.</h2><p class="muted">${esc(error.message)}</p></section>`;
    }
  });
  await updateActiveOrders();
  drawNav();
}

async function updateActiveOrders() {
  if (!store.profile) {
    store.activeOrders = 0;
    return;
  }
  const orders = await api.myOrders(store.profile.id).catch(() => []);
  store.activeOrders = orders.filter((o) => ["pending", "accepted", "printing", "dispatched"].includes(o.status)).length;
}

async function refresh() {
  [store.products, store.settings] = await Promise.all([api.products(), api.settings()]);
}

function welcome() {
  if (consumeLogin() && store.profile) playLogin({ name: firstName() });
}

async function boot() {
  document.getElementById("demo-bar").hidden = !DEMO;
  store.profile = await api.currentProfile();
  await refresh();
  mountSide("store", false);
  drawFooter();
  bindTilt(app);
  api.onAuthChange(async () => {
    store.profile = await api.currentProfile();
    welcome();
    await refresh();
    route();
  });
  window.addEventListener("hashchange", route);
  welcome();
  await route();
}

boot().catch((error) => {
  app.innerHTML = `<section class="section first empty"><h2>The store could not load.</h2><p class="muted">${esc(error.message)}</p></section>`;
});
