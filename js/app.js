import { api, DEMO } from "./api.js";
import { esc, money, when, toast, openModal, pickReason, tee, colorTag, STATUS, PAYMENT, paidLater, GOOGLE_ICON, DEFAULT_SIZE_CHART, productArt, sareeArt, sizeText, FREE_SIZE, wordmark, setCategories, categoryOf, categoryPath, isPrinted, specsOf, oneSize, photoOf } from "./ui.js";
import { calm, pageSwap, reveal, bindTilt, flyToBag, autoScroll, markLogin, consumeLogin, playLogin, playOrderPlaced } from "./motion.js";
import { mountSide, drawSide, sideToggle } from "./side.js";
import { homeLayout, DEFAULT_LOOKBOOK } from "./home-layout.js";
import { charactersSection, bindCharacters } from "./characters.js";
import { CUSTOMER_REASONS, SUPPORT_TOPICS } from "./reasons.js";

const app = document.getElementById("app");
const store = { profile: null, products: [], categories: [], settings: { shipping_inr: 79, free_shipping_over: 1499 }, activeOrders: 0, reviews: [], tiers: [] };
const activeTiers = () => store.tiers.filter((t) => t.active);
const reviewsFor = (productId) => store.reviews.filter((r) => r.product_id === productId);
const averageRating = (list) => (list.reduce((sum, r) => sum + r.rating, 0) / list.length).toFixed(1);
const starRow = (rating) => `<span class="stars" role="img" aria-label="${rating} out of 5 stars">${"★".repeat(rating)}<i>${"★".repeat(5 - rating)}</i></span>`;
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
const colorChoice = (product, hex) => {
  const colors = product?.colors || [];
  if (!colors.length) return null;
  return colors.find((c) => c.hex.toLowerCase() === (hex || "").toLowerCase()) || (!hex && colors.length === 1 ? colors[0] : undefined);
};
const bagLines = () => bag
  .map((line) => {
    const product = store.products.find((p) => p.id === line.product_id);
    return { ...line, product, choice: colorChoice(product, line.color) };
  })
  .filter((line) => line.product?.status === "live" && line.choice !== undefined);

function addToBag(productId, size, color = "") {
  const line = bag.find((l) => l.product_id === productId && l.size === size && (l.color || "") === color);
  if (line) line.quantity = Math.min(10, line.quantity + 1);
  else bag.push({ product_id: productId, size, color, quantity: 1 });
  writeBag();
  toast(size === FREE_SIZE ? "Added to bag" : `Added to bag, size ${size}`);
}

/* ---------- wishlist (kept in this browser) ---------- */
const WISH_KEY = "afterhours-wishlist";
let wish = (() => { try { return new Set(JSON.parse(localStorage.getItem(WISH_KEY) || "[]")); } catch { return new Set(); } })();
const isWished = (id) => wish.has(id);
function toggleWish(id) {
  if (wish.has(id)) wish.delete(id);
  else wish.add(id);
  try { localStorage.setItem(WISH_KEY, JSON.stringify([...wish])); } catch { /* still works for this visit */ }
  toast(wish.has(id) ? "Saved to your wishlist" : "Removed from your wishlist");
  document.querySelectorAll(`[data-wish="${id}"]`).forEach((b) => {
    b.classList.toggle("on", wish.has(id));
    b.setAttribute("aria-pressed", String(wish.has(id)));
  });
  const count = document.querySelector(".wish-count");
  if (count) count.textContent = wish.size || "";
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-wish]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  toggleWish(button.dataset.wish);
});
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>';
const heartButton = (p, extra = "") => `<button type="button" class="wish ${extra} ${isWished(p.id) ? "on" : ""}" data-wish="${esc(p.id)}" aria-pressed="${isWished(p.id)}" aria-label="Save ${esc(p.name)} to wishlist">${HEART}</button>`;

function totals(lines) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.product.price_inr, 0);
  const shipping = subtotal === 0 || subtotal >= store.settings.free_shipping_over ? 0 : store.settings.shipping_inr;
  return { subtotal, shipping, total: subtotal + shipping };
}

/* ---------- sign in ---------- */
function signInModal(reason = "Sign in to place orders and track them.") {
  const label = DEMO ? "Enter practice store" : `${GOOGLE_ICON} Continue with Google`;
  openModal(`${wordmark("modal-logo")}
    <h2 class="clock-title">Welcome</h2><p class="muted">${esc(reason)}</p>
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
  const query = location.hash.startsWith("#/search/") ? decodeURIComponent(location.hash.slice(9)) : "";
  document.getElementById("nav").innerHTML = `<nav class="nav">
    <div class="nav-left">${sideToggle()}<a class="brand" href="#/" aria-label="AfterHours home">${wordmark()}</a></div>
    <div class="nav-cats" aria-label="Categories">${liveCategories().slice(0, 5).map((c) => `<a href="${categoryPath(c.slug)}">${esc(c.name)}</a>`).join("")}<a href="#/shop">Shop all</a></div>
    <form class="nav-search" id="nav-search" role="search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4"/></svg><input name="q" type="search" placeholder="Search sarees, tees and more" aria-label="Search products" value="${esc(query)}"></form>
    <div class="links">
      <a class="icon-link search-link" href="#/search/" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4"/></svg></a>
      <a class="icon-link" href="#/wishlist" aria-label="Wishlist">${HEART}<b class="wish-count">${wish.size || ""}</b></a>
      <a class="bag-link" href="#/bag" aria-label="Bag"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l1 13H5L6 8Zm3 0V6a3 3 0 0 1 6 0v2"/></svg><span class="bag-word">Bag</span><b class="pill">${bagCount()}</b></a>
      ${signedIn ? "" : `<button class="btn small primary" id="sign-in">Sign in</button>`}
    </div>
  </nav>`;
  document.getElementById("sign-in")?.addEventListener("click", () => signInModal());
  document.getElementById("nav-search").addEventListener("submit", (event) => {
    event.preventDefault();
    const q = event.target.elements.q.value.trim();
    location.hash = `#/search/${encodeURIComponent(q)}`;
  });
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
  const info = s.support_phone ? [{ label: "Helpline", value: s.support_phone, href: `tel:${s.support_phone.replace(/\s/g, "")}` }] : [];
  const collectionsOf = (slug) => [...new Set(inCategory(slug).map((p) => p.collection))];
  drawSide({
    account: store.profile && { name: store.profile.full_name, email: store.profile.email, tag: store.profile.email },
    links: [
      { href: "#/", label: "Home", icon: "home" },
      { href: "#/search/", label: "Search", icon: "search" },
      { href: "#/deals", label: "Deals", icon: "tag" },
      ...liveCategories().map((c) => ({ label: c.name, icon: c.art === "saree" ? "saree" : c.art === "tee" ? "shop" : "grid", children: [{ href: categoryPath(c.slug), label: `All ${c.name.toLowerCase()}` }, ...collectionsOf(c.slug).map((name) => ({ href: `${categoryPath(c.slug)}/${encodeURIComponent(name)}`, label: name }))] })),
      { href: "#/wishlist", label: "Wishlist", icon: "heart", badge: wish.size || "" },
      { href: "#/orders", label: "My orders", icon: "orders", badge: store.activeOrders || "" },
      ...(activeTiers().length ? [{ href: "#/membership", label: "Membership", icon: "crown" }] : []),
      { href: "#/help", label: "Help and contact", icon: "help" },
    ],
    info,
    signOut: leave,
  });
}

function drawFooter() {
  const s = store.settings;
  document.getElementById("footer").innerHTML = `<div class="foot">
    <div class="foot-brand">${wordmark()}
      <p class="muted">${esc(store.settings.home_layout?.footer_text || "Sarees for every celebration, custom tees printed after you order, and more on the way.")}</p>
      ${s.business_address ? `<p class="muted small">AfterHours, ${esc(s.business_address)}</p>` : ""}
    </div>
    <nav class="foot-col" aria-label="Shop"><strong>Shop</strong>${liveCategories().map((c) => `<a href="${categoryPath(c.slug)}">${esc(c.name)}</a>`).join("")}<a href="#/shop">Everything</a></nav>
    <nav class="foot-col" aria-label="Help"><strong>Help</strong><a href="#/orders">My orders</a><a href="#/help">Contact us</a>
      <a href="privacy.html">Privacy Policy</a>
      ${s.instagram_url ? `<a href="${esc(s.instagram_url)}" target="_blank" rel="noopener">Instagram</a>` : ""}
    </nav>
    <p class="foot-legal muted small">© ${new Date().getFullYear()} AfterHours. Pay by ${esc(paymentText())}.</p>
  </div>`;
}

const paymentTrust = () => {
  if (hasUpi() && hasCod()) return ["Pay your way", "Pay by UPI, or cash when it arrives."];
  if (hasUpi()) return ["Pay by UPI", "We confirm your payment before we prepare your order."];
  return ["Pay when it arrives", "Cash on delivery. No card or UPI needed to order."];
};

const trustItems = () => [
  paymentTrust(),
  ["Checked by hand", "Every piece is checked for colour, finish and fit before it ships."],
  ["Tees printed for you", "Custom tees go to print after your order is accepted."],
  ["Cancel before we accept", "Cancel an unpaid order yourself, or contact us about a paid one."],
  ["Follow every step", "See it move from accepted to printing to delivered."],
  ["Safe Google sign-in", "We never see or store your Google password."],
];

const trustStrip = () => `<section class="trust" aria-label="Why shop with AfterHours">${trustItems().map(([title, text]) => `<div><strong>${title}</strong><span class="muted">${text}</span></div>`).join("")}</section>`;

/* ---------- catalogue pieces ---------- */
const visible = () => store.products.filter((p) => p.status !== "hidden");
const liveCategories = () => store.categories.filter((c) => c.status === "live");
const inCategory = (slug) => visible().filter((p) => p.category === slug);
const offPct = (p) => (p.compare_at_inr > p.price_inr ? Math.round((1 - p.price_inr / p.compare_at_inr) * 100) : 0);
const newestOf = (items) => [...items].sort((a, b) => b.sort - a.sort)[0];
const countText = (n) => `${n} ${n === 1 ? "item" : "items"}`;
const subLine = (p) => specsOf(p).slice(0, 2).map(([, v]) => v).join(" · ") || p.tagline;

function card(p) {
  const off = offPct(p);
  const soon = p.status === "coming_soon";
  const printed = isPrinted(p);
  const first = p.colors?.[0];
  let art;
  if (printed) {
    art = `<div class="flip tee-flip"><div class="side a">${tee(p, "back", false, first?.hex)}</div><div class="side b">${tee(p, "front", false, first?.hex)}</div></div>`;
  } else {
    const second = [...(first?.images || []), ...(p.gallery || [])][1];
    art = second
      ? `<div class="flip"><div class="side a">${productArt(p)}</div><div class="side b"><img class="photo" src="${esc(second)}" alt="" loading="lazy"></div></div>`
      : productArt(p);
  }
  const reviews = reviewsFor(p.id);
  return `<a class="card ${printed ? "is-tee" : "is-photo"}" href="#/p/${esc(p.slug)}">
    <div class="card-art">
      <span class="tag">${esc(soon ? "Coming soon" : p.collection)}</span>
      ${heartButton(p)}
      ${art}
      ${off && !soon ? `<span class="off-badge">${off}% off</span>` : ""}
    </div>
    <div class="card-info">
      <span class="card-cat">${esc(categoryOf(p).name)}</span>
      <h3>${esc(p.name)}</h3>
      <p class="muted">${esc(subLine(p))}</p>
      ${reviews.length ? `<p class="card-rating"><b>★</b> ${averageRating(reviews)} <span class="muted">(${reviews.length})</span></p>` : ""}
      <p class="price">${money(p.price_inr)}${off ? ` <s>${money(p.compare_at_inr)}</s> <em>${off}% off</em>` : ""}</p>
      ${p.colors?.length > 1 ? `<div class="dots" role="img" aria-label="${p.colors.length} colours">${p.colors.slice(0, 6).map((c) => `<i style="--c:${esc(c.hex)}"></i>`).join("")}</div>` : ""}
    </div>
  </a>`;
}

const grid = (items, empty = "Nothing here yet.") => `<div class="grid">${items.map(card).join("") || `<p class="muted">${esc(empty)}</p>`}</div>`;

function priceRow(collection) {
  const items = visible().filter((p) => p.collection === collection);
  if (!items.length) return "";
  const lowest = Math.min(...items.map((p) => p.price_inr));
  return `<div class="tier"><span class="kicker">${esc(collection)}</span><strong>${money(lowest)}</strong><span class="muted">Starting price, ${countText(items.length)}</span></div>`;
}

function pricing() {
  const collections = [...new Set(visible().map((p) => p.collection))];
  const { shipping_inr: fee, free_shipping_over: free } = store.settings;
  return `<section class="section" id="pricing">
    <div class="head center"><span class="kicker">Pricing</span><h2>Prices at a glance</h2></div>
    <div class="tiers">${collections.map(priceRow).join("")}
      <div class="tier hot"><span class="kicker">Shipping</span><strong>${fee ? money(fee) : "Free"}</strong><span>${fee ? `free on orders over ${money(free)}` : "on every order"}</span></div>
    </div>
  </section>`;
}

function lookbook(layout) {
  const photos = layout.lookbook?.length ? layout.lookbook : DEFAULT_LOOKBOOK;
  return `<section class="section">
    <div class="head center"><span class="kicker">Lookbook</span><h2>${esc(layout.lookbook_title || "Worn after hours")}</h2></div>
    <div class="lookbook" tabindex="0" aria-label="Lookbook photos">${photos.map((ph) => {
      const img = `<img src="${esc(ph.src)}" alt="${esc(ph.caption || "AfterHours lookbook photo")}" loading="lazy">`;
      const inner = `${img}${ph.caption ? `<span class="look-cap">${esc(ph.caption)}</span>` : ""}`;
      return ph.link ? `<a class="look" href="${esc(ph.link)}">${inner}</a>` : `<figure class="look">${inner}</figure>`;
    }).join("")}</div>
  </section>`;
}

function howItWorks() {
  const steps = [
    ["Choose", "Pick from sarees, custom tees and more, in your colour and size."],
    ["We confirm", "We check your order and accept it, usually the same day."],
    ["We prepare it", "Pieces are checked and packed. Tees are printed just for you."],
    ["Delivered", "Track every step from your orders page until it arrives."],
  ];
  return `<section class="section">
    <div class="head center"><span class="kicker">How it works</span><h2>From our hands to yours</h2></div>
    <ol class="steps">${steps.map(([t, d], i) => `<li><span class="step-no">${i + 1}</span><h3>${t}</h3><p class="muted">${d}</p></li>`).join("")}</ol>
  </section>`;
}

/* ---------- home page ---------- */
const PREVIEW = new URLSearchParams(location.search).has("preview");

function hero(layout) {
  const banners = (layout.banners || []).filter((b) => b.image);
  if (banners.length) {
    return `<section class="banners" aria-roledescription="carousel" aria-label="Offers">
      <div class="banner-track">${banners.map((b, i) => `<a class="banner ${i ? "" : "on"}" href="${esc(b.link || "#/shop")}" style="--img:url('${esc(b.image)}')" aria-hidden="${i ? "true" : "false"}">
        <img src="${esc(b.image)}" alt="" ${i ? 'loading="lazy"' : ""}>
        ${b.title || b.text ? `<span class="banner-copy">${b.kicker ? `<span class="kicker">${esc(b.kicker)}</span>` : ""}${b.title ? `<b>${esc(b.title)}</b>` : ""}${b.text ? `<span>${esc(b.text)}</span>` : ""}<em class="btn primary">${esc(b.button || "Shop now")}</em></span>` : ""}
      </a>`).join("")}</div>
      ${banners.length > 1 ? `<div class="banner-dots">${banners.map((_, i) => `<button class="${i ? "" : "on"}" data-banner="${i}" aria-label="Show offer ${i + 1}"></button>`).join("")}</div>` : ""}
    </section>`;
  }
  const h = layout.hero;
  const featured = visible().find((p) => p.slug === h.product);
  const first = featured || newestOf(visible().filter((p) => !isPrinted(p))) || newestOf(visible());
  const second = newestOf(visible().filter((p) => p !== first && p.category !== first?.category)) || newestOf(visible().filter((p) => p !== first));
  const { free_shipping_over: free, shipping_inr: fee } = store.settings;
  const points = [hasCod() ? "Cash on delivery" : "Easy UPI payment", fee ? `Free shipping over ${money(free)}` : "Free shipping", "Track every order"];
  const copy = !store.profile || PREVIEW
    ? { kicker: esc(h.kicker), title: `${esc(h.line1)}<br><em>${esc(h.line2)}</em>`, body: esc(h.text) }
    : { kicker: "Welcome back", title: `Namaste,<br><em>${esc(firstName())}.</em>`, body: "New arrivals and fresh deals are waiting below. Your orders are one tap away." };
  const tile = (p, cls) => (p ? `<a class="hero-tile ${isPrinted(p) ? "tile-tee" : "tile-saree"} ${cls}" href="#/p/${esc(p.slug)}">
      <div class="hero-pic">${isPrinted(p) ? tee(p, "back", true, p.colors?.[0]?.hex) : productArt(p, { eager: true })}</div>
      <span class="hero-label"><small>${esc(categoryOf(p).name)}</small><b>${esc(p.name)}</b><em>${money(p.price_inr)}</em></span>
    </a>` : `<a class="hero-tile tile-saree ${cls}" href="#/shop"><div class="hero-pic">${sareeArt("#8C1C2B")}</div><span class="hero-label"><small>New in</small><b>Arriving soon</b></span></a>`);
  const cats = liveCategories().slice(0, 2);
  return `<section class="hero">
    <div class="hero-copy">
      <span class="kicker">${copy.kicker}</span>
      <h1>${copy.title}</h1>
      <p class="lead">${copy.body}</p>
      <div class="row">${cats.map((c, i) => `<a class="btn ${i ? "" : "primary"}" href="${categoryPath(c.slug)}">Shop ${esc(c.name.toLowerCase())}</a>`).join("") || '<a class="btn primary" href="#/shop">Start shopping</a>'}</div>
      <ul class="hero-points">${points.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    </div>
    <div class="hero-art">${tile(first, "big")}${tile(second, "small")}</div>
  </section>`;
}

function bindBanners() {
  const slides = [...app.querySelectorAll(".banner")];
  if (slides.length < 2) return;
  let index = 0;
  let paused = false;
  const show = (i) => {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, n) => { s.classList.toggle("on", n === index); s.setAttribute("aria-hidden", String(n !== index)); });
    app.querySelectorAll("[data-banner]").forEach((b, n) => b.classList.toggle("on", n === index));
  };
  app.querySelectorAll("[data-banner]").forEach((b) => b.addEventListener("click", () => { paused = true; show(Number(b.dataset.banner)); }));
  const box = app.querySelector(".banners");
  box.addEventListener("pointerenter", () => { paused = true; });
  box.addEventListener("pointerleave", () => { paused = false; });
  if (calm) return;
  const timer = setInterval(() => {
    if (!box.isConnected) return clearInterval(timer);
    if (!paused && !document.hidden) show(index + 1);
  }, 5000);
}

function categories() {
  const cats = liveCategories();
  if (!cats.length) return "";
  const popular = [];
  cats.forEach((c) => (c.fields || []).filter((f) => f.filter).forEach((f) => inCategory(c.slug).forEach((p) => {
    const v = p.details?.[f.key];
    if (v && !popular.some((x) => x.v === v && x.c === c.slug)) popular.push({ v, c: c.slug });
  })));
  return `<section class="section cats">
    <div class="head center"><span class="kicker">Shop by category</span><h2>Find your favourite</h2></div>
    <div class="circles">${cats.map((c) => {
      const pick = newestOf(inCategory(c.slug));
      const pic = c.image ? `<img class="photo" src="${esc(c.image)}" alt="" loading="lazy">` : pick ? productArt(pick) : productArt({ category: c.slug });
      return `<a class="circle ${c.art === "tee" && !c.image ? "is-tee" : ""}" href="${categoryPath(c.slug)}"><span class="circle-pic">${pic}</span><b>${esc(c.name)}</b><small>${inCategory(c.slug).length ? countText(inCategory(c.slug).length) : "Arriving soon"}</small></a>`;
    }).join("")}</div>
    ${popular.length ? `<div class="occasions"><span class="muted small">Popular</span>${popular.slice(0, 10).map((x) => `<a class="chip" href="${categoryPath(x.c)}/${encodeURIComponent(x.v)}">${esc(x.v)}</a>`).join("")}</div>` : ""}
  </section>`;
}

function deals() {
  const items = visible().filter((p) => p.status === "live" && offPct(p) > 0).sort((a, b) => offPct(b) - offPct(a)).slice(0, 8);
  if (!items.length) return "";
  return `<section class="section deals"><div class="head"><span class="kicker">Up to ${offPct(items[0])}% off</span><h2>Deals of the day</h2><a class="more" href="#/deals">See all</a></div>
    <div class="scroller">${items.map(card).join("")}</div></section>`;
}

function featured(layout) {
  const items = (layout.featured || []).map((slug) => visible().find((p) => p.slug === slug)).filter(Boolean);
  if (!items.length) return "";
  return `<section class="section"><div class="head"><span class="kicker">Handpicked</span><h2>${esc(layout.featured_title || "Picked for you")}</h2></div>${grid(items)}</section>`;
}

const memberStrip = () => {
  const tiers = activeTiers();
  if (!tiers.length) return "";
  return `<a class="strip member-strip" href="#/membership"><span class="mono">Members</span><strong>Save up to ${Math.max(...tiers.map((t) => t.discount_pct))}% on every order</strong><span class="muted">See how</span></a>`;
};

async function pageMembership() {
  const tiers = activeTiers();
  const openedAt = location.hash;
  const status = store.profile ? await api.membership().catch(() => null) : null;
  if (location.hash !== openedAt) return;
  if (!tiers.length) {
    app.innerHTML = `<section class="section first"><div class="head"><h2>Membership</h2></div><p class="muted">Membership isn't open right now. Please check back soon.</p></section>`;
    return;
  }
  const orderWord = (n) => `${n} delivered order${n === 1 ? "" : "s"}`;
  let panel;
  if (status) {
    const { delivered, tier, next } = status;
    const bar = next ? `<div class="member-bar" role="progressbar" aria-label="Progress to ${esc(next.name)}" aria-valuemin="0" aria-valuemax="${next.min_orders}" aria-valuenow="${delivered}"><i style="width:${Math.min((delivered / next.min_orders) * 100, 100)}%"></i></div>
      <p class="muted small">${next.min_orders - delivered} more delivered order${next.min_orders - delivered === 1 ? "" : "s"} to reach ${esc(next.name)} and save ${next.discount_pct}%.</p>` : '<p class="muted small">You have reached the top tier. Thank you for sticking with us.</p>';
    panel = `<div class="panel member-status"><span class="mono muted">${orderWord(delivered)} so far</span><br>
      <strong>${tier ? `${esc(tier.name)} member` : "Not a member yet"}</strong>
      ${tier ? `<p>You get ${tier.discount_pct}% off every order, taken off automatically at checkout.</p>` : ""}${bar}</div>`;
  } else {
    panel = `<div class="panel member-status"><p>Sign in to see your progress. Membership is free and starts with your first order.</p><button class="btn primary" id="member-signin">Sign in</button></div>`;
  }
  const upi = store.settings.prepaid_discount_pct && hasUpi();
  app.innerHTML = `<section class="section first">
    <div class="head"><span class="mono kicker">AfterHours members</span><h2>Keep coming back. Pay less.</h2></div>
    ${panel}
    <div class="tiers">${tiers.map((t) => `<div class="tier ${status?.tier?.name === t.name ? "hot" : ""}"><span class="mono">${esc(t.name)}</span><strong>${t.discount_pct}% off</strong><span class="muted">From ${orderWord(t.min_orders)}</span></div>`).join("")}</div>
    <ul class="member-rules">
      <li>It's free, with nothing to sign up for. Every delivered order counts automatically.</li>
      <li>Your discount comes off every order at checkout.</li>
      <li>Cancelled, declined and refused orders don't count.</li>
      <li>A member discount can't be combined with a coupon. You always get whichever saves you more.</li>
      ${upi ? `<li>Paying in full by UPI still saves you an extra ${store.settings.prepaid_discount_pct}%.</li>` : ""}
    </ul>
    <div class="row member-cta"><a class="btn primary" href="#/shop">Start shopping</a></div>
  </section>`;
  document.getElementById("member-signin")?.addEventListener("click", () => signInModal());
}

async function activeOrderStrip() {
  if (!store.profile) return "";
  const orders = await api.myOrders(store.profile.id);
  const active = orders.find((o) => ["pending", "accepted", "printing", "dispatched"].includes(o.status));
  if (!active) return "";
  return `<a class="strip" href="#/orders"><span class="mono">${esc(active.order_no)}</span><strong>${STATUS[active.status].label}</strong><span class="muted">View order</span></a>`;
}

async function pageHome() {
  const layout = homeLayout(store.settings.home_layout);
  const latestSort = (name) => Math.max(...visible().filter((p) => p.collection === name).map((p) => p.sort));
  const newestFirst = [...new Set(visible().map((p) => p.collection))].sort((a, b) => latestSort(b) - latestSort(a));
  const chosen = newestFirst.filter((name) => layout.collections.includes(name));
  const collections = chosen.length ? chosen : newestFirst.slice(0, 3);
  const collectionRows = collections.map((name) => {
    const items = visible().filter((p) => p.collection === name);
    const cat = categoryOf(items[0]);
    return `<section class="section"><div class="head"><span class="kicker">${esc(cat.name)} collection</span><h2>${esc(name)}</h2><a class="more" href="${categoryPath(cat.slug)}/${encodeURIComponent(name)}">See all</a></div>${grid(items.slice(0, 4))}</section>`;
  }).join("");
  const { shipping_inr: fee, free_shipping_over: free } = store.settings;
  const words = layout.marquee?.length ? layout.marquee : [...liveCategories().map((c) => c.name), fee ? `Free shipping over ${money(free)}` : "Free shipping", hasCod() ? "Cash on delivery" : "Easy UPI payment", "New drops every week"];
  const run = words.map((w) => `<span>${esc(w)}</span>`).join("<i>✦</i>");
  const marquee = Array(4).fill(run).join("<i>✦</i>");
  const shoppable = visible().filter((p) => p.status === "live");
  const parts = {
    categories,
    gang: () => (layout.characters?.on === false ? "" : charactersSection(shoppable, layout.characters)),
    deals,
    featured: () => featured(layout),
    marquee: () => `<div class="marquee" aria-hidden="true"><div>${marquee}<i>✦</i>${marquee}</div></div>`,
    trust: trustStrip,
    member: memberStrip,
    collections: () => collectionRows,
    lookbook: () => lookbook(layout),
    pricing,
    how: howItWorks,
  };
  app.innerHTML = `${layout.banner.on && layout.banner.text ? `<p class="announce">${esc(layout.banner.text)}</p>` : ""}${hero(layout)}<div id="strip"></div>
    ${layout.sections.filter((s) => s.on).map((s) => parts[s.id]?.() || "").join("")}`;
  bindBanners();
  if (app.querySelector(".gang")) bindCharacters(app, shoppable, layout.characters, calm);
  const lookbookStrip = app.querySelector(".lookbook");
  if (lookbookStrip) autoScroll(lookbookStrip);
  reveal(app);
  const strip = await activeOrderStrip().catch(() => "");
  const slot = document.getElementById("strip");
  if (slot) slot.innerHTML = strip;
}

/* ---------- product lists with filters ---------- */
const filt = { key: "", price: "", off: 0, colour: "", gender: "", specs: {}, sort: "featured" };
const SORTS = [["featured", "Featured"], ["new", "Newest"], ["off", "Better discount"], ["low", "Price: low to high"], ["high", "Price: high to low"]];
const PRICES = [["u500", "Under ₹500", 0, 499], ["500", "₹500 to ₹999", 500, 999], ["1000", "₹1,000 to ₹1,999", 1000, 1999], ["2000", "₹2,000 to ₹4,999", 2000, 4999], ["5000", "₹5,000 and above", 5000, Infinity]];
const DISCOUNTS = [[10, "10% or more"], [25, "25% or more"], [40, "40% or more"]];
const GENDERS = [["female", "Women"], ["male", "Men"]];

const sorted = (items) => {
  const list = [...items];
  if (filt.sort === "new") return list.sort((a, b) => b.sort - a.sort);
  if (filt.sort === "off") return list.sort((a, b) => offPct(b) - offPct(a));
  if (filt.sort === "low") return list.sort((a, b) => a.price_inr - b.price_inr);
  if (filt.sort === "high") return list.sort((a, b) => b.price_inr - a.price_inr);
  return list;
};

/** One listing page: a category, everything, search results, deals or the wishlist. */
function pageList(key, { title, kicker, intro, theme = "", items, category = null, empty = "Nothing here yet.", chips = "" }) {
  if (filt.key !== key) Object.assign(filt, { key, price: "", off: 0, colour: "", gender: "", specs: {} });
  const fields = category ? (category.fields || []).filter((f) => f.filter) : [];
  const priceOf = (id) => PRICES.find(([v]) => v === id);
  const passes = (p, skip) => {
    if (skip !== "price" && filt.price) { const [, , lo, hi] = priceOf(filt.price); if (p.price_inr < lo || p.price_inr > hi) return false; }
    if (skip !== "off" && filt.off && offPct(p) < filt.off) return false;
    if (skip !== "colour" && filt.colour && !(p.colors || []).some((c) => c.name === filt.colour)) return false;
    if (skip !== "gender" && filt.gender && p.gender !== filt.gender && p.gender !== "unisex") return false;
    return Object.entries(filt.specs).every(([k, v]) => skip === k || !v || p.details?.[k] === v);
  };
  const shown = items.filter((p) => passes(p));
  const groups = [
    ...fields.map((f) => ({ id: f.key, label: f.label, options: [...new Set(items.map((p) => p.details?.[f.key]).filter(Boolean))].map((v) => [v, v]), value: filt.specs[f.key] || "" })),
    { id: "price", label: "Price", options: PRICES.filter(([, , lo, hi]) => items.some((p) => p.price_inr >= lo && p.price_inr <= hi)).map(([v, l]) => [v, l]), value: filt.price },
    { id: "colour", label: "Colour", options: [...new Set(items.flatMap((p) => (p.colors || []).map((c) => c.name)).filter(Boolean))].map((v) => [v, v]), value: filt.colour },
    { id: "off", label: "Discount", options: DISCOUNTS.filter(([n]) => items.some((p) => offPct(p) >= n)).map(([n, l]) => [String(n), l]), value: filt.off ? String(filt.off) : "" },
    { id: "gender", label: "Made for", options: GENDERS.filter(([g]) => items.some((p) => p.gender === g)).map(([g, l]) => [g, l]), value: filt.gender },
  ].filter((g) => g.options.length > 1 || g.value);
  const active = groups.filter((g) => g.value);
  const count = (g, v) => items.filter((p) => passes(p, g.id) && (g.id === "price" ? (() => { const [, , lo, hi] = priceOf(v); return p.price_inr >= lo && p.price_inr <= hi; })()
    : g.id === "colour" ? (p.colors || []).some((c) => c.name === v) : g.id === "off" ? offPct(p) >= Number(v) : g.id === "gender" ? p.gender === v || p.gender === "unisex" : p.details?.[g.id] === v)).length;
  const wide = matchMedia("(min-width: 821px)").matches;
  app.innerHTML = `<section class="shop-head ${theme}">
      <span class="kicker">${esc(kicker)}</span>
      <h1>${esc(title)}</h1>
      ${intro ? `<p class="lead">${esc(intro)}</p>` : ""}
    </section>
    <section class="section first">
      ${chips ? `<div class="chips cat-chips">${chips}</div>` : ""}
      <div class="plp ${groups.length ? "" : "no-filters"}">
        ${groups.length ? `<details class="filters" ${wide ? "open" : ""}><summary>Filters${active.length ? ` <b class="pill">${active.length}</b>` : ""}</summary>
          ${active.length ? '<button type="button" class="linkish" data-clear>Clear all</button>' : ""}
          ${groups.map((g) => `<fieldset class="fgroup"><legend>${esc(g.label)}</legend>${g.options.map(([v, l]) => `<button type="button" class="fopt ${g.value === v ? "on" : ""}" data-g="${esc(g.id)}" data-v="${esc(v)}" aria-pressed="${g.value === v}">${g.id === "colour" ? `<i style="--c:${esc(items.flatMap((p) => p.colors || []).find((c) => c.name === v)?.hex || "#ccc")}"></i>` : ""}<span>${esc(l)}</span><small>${count(g, v)}</small></button>`).join("")}</fieldset>`).join("")}
        </details>` : ""}
        <div class="plp-main">
          <div class="shop-bar">
            <p class="muted small count">${countText(shown.length)}${active.length ? ` · ${active.map((g) => esc(g.options.find(([v]) => v === g.value)?.[1] || g.value)).join(", ")}` : ""}</p>
            <label class="sort"><span class="muted small">Sort</span><select id="sort">${SORTS.map(([v, l]) => `<option value="${v}" ${v === filt.sort ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          </div>
          ${grid(sorted(shown), items.length ? "No products match these filters." : empty)}
        </div>
      </div>
    </section>`;
  const redraw = () => pageList(key, { title, kicker, intro, theme, items, category, empty, chips });
  app.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => {
    const { g, v } = b.dataset;
    const same = (cur) => (cur === v ? "" : v);
    if (g === "price") filt.price = same(filt.price);
    else if (g === "colour") filt.colour = same(filt.colour);
    else if (g === "gender") filt.gender = same(filt.gender);
    else if (g === "off") filt.off = filt.off === Number(v) ? 0 : Number(v);
    else filt.specs[g] = same(filt.specs[g] || "");
    const open = app.querySelector(".filters")?.open;
    redraw();
    const box = app.querySelector(".filters");
    if (box && open) box.open = true;
  }));
  app.querySelector("[data-clear]")?.addEventListener("click", () => {
    Object.assign(filt, { price: "", off: 0, colour: "", gender: "", specs: {} });
    redraw();
  });
  document.getElementById("sort").addEventListener("change", (event) => {
    filt.sort = event.target.value;
    redraw();
  });
  reveal(app);
}

const categoryChips = (active = "") => [["#/shop", "All", !active], ...liveCategories().map((c) => [categoryPath(c.slug), c.name, c.slug === active])].map(([href, label, on]) => `<a class="chip ${on ? "on" : ""}" href="${href}">${esc(label)}</a>`).join("");

function pageCategory(slug, value = "") {
  const c = store.categories.find((x) => x.slug === slug);
  if (!c) return notFound();
  const base = inCategory(slug);
  const matches = (p) => !value || p.collection === value || Object.values(p.details || {}).some((v) => String(v) === value);
  const filterChips = [...new Set(base.map((p) => p.collection))].map((name) => `<a class="chip ${name === value ? "on" : ""}" href="${categoryPath(slug)}/${encodeURIComponent(name)}">${esc(name)}</a>`).join("");
  pageList(`c:${slug}:${value}`, {
    title: value ? `${value} ${c.name.toLowerCase()}` : c.name,
    kicker: value ? c.name : "Shop by category",
    intro: value ? "" : c.tagline,
    theme: c.art === "tee" ? "head-tee" : c.art === "saree" ? "head-saree" : "head-photo",
    items: base.filter(matches),
    category: c,
    empty: `Our first ${c.name.toLowerCase()} are arriving soon. Check back in a few days.`,
    chips: categoryChips(slug) + (filterChips ? `<span class="chip-gap"></span>${filterChips}` : ""),
  });
}

function pageShop(collection = "") {
  const items = visible().filter((p) => !collection || p.collection === collection);
  pageList(`shop:${collection}`, { title: collection || "Shop everything", kicker: "The catalogue", intro: collection ? "" : "Every category, every collection, in one place.", items, chips: categoryChips("") });
}

const searchText = (p) => [p.name, p.tagline, p.collection, p.description, categoryOf(p).name, ...Object.values(p.details || {}).map(String), ...(p.colors || []).map((c) => c.name)].join(" ").toLowerCase();
function pageSearch(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const items = words.length ? visible().filter((p) => words.every((w) => searchText(p).includes(w))) : [];
  pageList(`search:${query}`, {
    title: query ? `Results for "${query}"` : "Search",
    kicker: "Search",
    intro: query ? "" : "Try silk, wedding, oversized or a colour.",
    items,
    empty: query ? "Nothing matched. Try a shorter word, or browse a category below." : "Start typing to search.",
    chips: categoryChips(""),
  });
  const input = document.querySelector("#nav-search input");
  if (input && !query && matchMedia("(min-width: 821px)").matches) input.focus();
  if (!matchMedia("(min-width: 821px)").matches && !query) {
    app.querySelector(".shop-head").insertAdjacentHTML("beforeend", '<form class="nav-search inline" id="page-search" role="search"><input name="q" type="search" placeholder="Search sarees, tees and more" aria-label="Search products"></form>');
    const form = document.getElementById("page-search");
    form.elements.q.focus();
    form.addEventListener("submit", (event) => { event.preventDefault(); location.hash = `#/search/${encodeURIComponent(form.elements.q.value.trim())}`; });
  }
}

function pageDeals() {
  pageList("deals", { title: "Deals of the day", kicker: "Offers", intro: "Everything on sale right now, biggest savings first.", items: visible().filter((p) => offPct(p) > 0).sort((a, b) => offPct(b) - offPct(a)), empty: "No deals right now. Check back soon.", chips: categoryChips("") });
}

function pageWishlist() {
  const items = visible().filter((p) => wish.has(p.id));
  pageList("wishlist", { title: "Your wishlist", kicker: `${countText(items.length)} saved`, intro: "Saved on this device. Tap the heart on any product to add it here.", items, empty: "Nothing saved yet. Tap the heart on a product you love.", chips: "" });
}

/* ---------- product page ---------- */
function pageProduct(slug) {
  const p = visible().find((x) => x.slug === slug);
  if (!p) return notFound();
  const cat = categoryOf(p);
  const printed = isPrinted(p);
  const colors = p.colors || [];
  let color = colors[0] || null;
  const fixedSlides = printed ? [{ side: "back", label: "Back" }, { side: "front", label: "Front" }] : [];
  if (p.model_image) fixedSlides.push({ src: p.model_image, label: "On model" });
  (p.gallery || []).forEach((src, i) => fixedSlides.push({ src, label: `Photo ${i + 1}` }));
  const slidesFor = (c) => {
    const list = [...(c?.images || []).map((src, i) => ({ src, label: `${c.name} photo ${i + 1}` })), ...fixedSlides];
    return list.length ? list : [{ art: true, label: p.name }];
  };
  let slides = slidesFor(color);
  const slideView = (s) => (s.src ? `<img class="model" src="${esc(s.src)}" alt="${esc(p.name)}: ${esc(s.label)}">` : s.art ? productArt({ ...p, colors: [], gallery: [], model_image: null }, { hex: color?.hex }) : tee(p, s.side, true, color?.hex));
  const thumbView = (s) => (s.src ? `<img src="${esc(s.src)}" alt="" loading="lazy">` : s.art ? productArt({ ...p, colors: [], gallery: [], model_image: null }, { hex: color?.hex }) : tee(p, s.side, false, color?.hex));
  const reviews = reviewsFor(p.id);
  const live = p.status === "live";
  const off = offPct(p);
  const single = oneSize(p);
  const specs = specsOf(p);
  const sizeFit = p.size_fit || cat.size_fit;
  const care = p.care || cat.care;
  const assure = [
    printed ? (colors.length > 1 ? "Printed to order" : `Printed to order on a ${(colors[0]?.name || "black").toLowerCase()} tee`) : "Checked by hand and packed with care",
    single ? "One size, nothing to choose" : "",
    `Pay by ${paymentText()} (shipping ${shippingText()})`,
    store.settings.delivery_note || "",
  ].filter(Boolean);
  const section = (id, title, body, open = false) => (body ? `<details class="pd-sec" ${open ? "open" : ""}><summary>${title}</summary><div class="pd-body">${body}</div></details>` : "");
  app.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span>/</span><a href="${categoryPath(cat.slug)}">${esc(cat.name)}</a><span>/</span><span>${esc(p.name)}</span></nav>
  <section class="section first pdp ${printed ? "is-tee" : "is-photo"}">
    <div class="gallery">
      <div class="stage" id="stage">${slideView(slides[0])}</div>
      <div class="thumbs" id="thumbs"></div>
    </div>
    <div class="buy">
      <span class="kicker">${esc(p.collection)}</span>
      <h1>${esc(p.name)}</h1>
      ${p.tagline ? `<p class="lead">${esc(p.tagline)}</p>` : ""}
      ${reviews.length ? `<a class="rating-link" href="#reviews-section" id="rating-link">${starRow(Math.round(averageRating(reviews)))} ${averageRating(reviews)} (${reviews.length} review${reviews.length === 1 ? "" : "s"})</a>` : ""}
      <p class="price big">${money(p.price_inr)}${off ? ` <s>${money(p.compare_at_inr)}</s> <em>${off}% off</em>` : ""}</p>
      <p class="muted small tax">Inclusive of all taxes</p>
      ${live && colors.length > 1 ? `<span class="label">Colour: <b id="color-name">${esc(color.name)}</b></span>
      <div class="swatches">${colors.map((c, i) => `<button class="swatch ${i ? "" : "on"}" data-color="${i}" style="--c:${esc(c.hex)}" title="${esc(c.name)}" aria-label="${esc(c.name)}" aria-pressed="${!i}"></button>`).join("")}</div>` : ""}
      ${live && !single ? `<div class="size-head"><span class="label">Select size</span>${printed ? '<button type="button" class="size-guide" id="size-guide">Size guide</button>' : ""}</div>
      <div class="sizes">${p.sizes.map((s, i) => `<button class="size ${i === Math.min(1, p.sizes.length - 1) ? "on" : ""}" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}
      <div class="row buy-row">${live ? '<button class="btn primary" id="add">Add to bag</button>' : '<p class="notice">Coming soon</p>'}<button class="btn wish-btn ${isWished(p.id) ? "on" : ""}" data-wish="${esc(p.id)}" aria-pressed="${isWished(p.id)}">${HEART}<span>Wishlist</span></button></div>
      ${live ? '<button class="linkish buy-now" id="buy">Buy now</button>' : ""}
      <div class="pd">
        ${section("details", "Product details", p.description ? `<p class="desc">${esc(p.description)}</p>` : "", true)}
        ${section("specs", "Specifications", specs.length ? `<dl class="facts">${specs.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>` : "", true)}
        ${section("fit", "Size and fit", sizeFit ? `<p>${esc(sizeFit)}</p>` : "")}
        ${section("care", "Material and care", care ? `<p>${esc(care)}</p>` : "")}
      </div>
      <ul class="assure">${assure.map((t) => `<li>${esc(t)}</li>`).join("")}<li>Questions? <a href="#/help">Contact us</a></li></ul>
    </div>
  </section>
  <section class="section reviews" id="reviews-section">
    <div class="head"><span class="kicker">From verified buyers</span><h2>Reviews</h2></div>
    ${reviews.length ? `<div class="review-list">${reviews.slice(0, 20).map((r) => `<article class="panel review">${starRow(r.rating)}${r.comment ? `<p>${esc(r.comment)}</p>` : ""}<p class="muted small">${esc(r.reviewer_name)} · Verified buyer · ${new Date(r.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p></article>`).join("")}</div>`
    : '<p class="muted">No reviews yet. Customers can leave a review from their orders page after delivery.</p>'}
  </section>
  ${related(p)}`;
  const stage = document.getElementById("stage");
  const thumbs = document.getElementById("thumbs");
  let current = 0;
  let holdUntil = 0;
  const showSlide = (index) => {
    current = index;
    stage.innerHTML = slideView(slides[index]);
    stage.firstElementChild.classList.add("swap-in");
    thumbs.querySelectorAll("[data-slide]").forEach((b, i) => {
      b.classList.toggle("on", i === index);
      if (i === index) thumbs.scrollTo({ left: b.offsetLeft - (thumbs.clientWidth - b.offsetWidth) / 2, behavior: calm ? "auto" : "smooth" });
    });
  };
  const drawThumbs = () => {
    thumbs.innerHTML = slides.length > 1 ? slides.map((s, i) => `<button class="thumb-btn ${i === current ? "on" : ""}" data-slide="${i}" aria-label="Show ${esc(s.label)}" title="${esc(s.label)}">${thumbView(s)}</button>`).join("") : "";
  };
  drawThumbs();
  thumbs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slide]");
    if (!button) return;
    holdUntil = Date.now() + 10000;
    showSlide(Number(button.dataset.slide));
  });
  document.getElementById("rating-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("reviews-section").scrollIntoView({ behavior: calm ? "auto" : "smooth" });
  });
  if (!calm && slides.length > 1) {
    const gallery = app.querySelector(".gallery");
    let hovering = false;
    gallery.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse") hovering = true; });
    gallery.addEventListener("pointerleave", () => { hovering = false; });
    gallery.addEventListener("touchstart", () => { holdUntil = Date.now() + 8000; }, { passive: true });
    const timer = setInterval(() => {
      if (!stage.isConnected) return clearInterval(timer);
      if (document.hidden || hovering || Date.now() < holdUntil) return;
      showSlide((current + 1) % slides.length);
    }, 3500);
  }
  let size = single ? (p.sizes?.[0] || FREE_SIZE) : p.sizes[Math.min(1, p.sizes.length - 1)];
  app.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => {
    size = b.dataset.s;
    app.querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("on", x === b));
  }));
  app.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => {
    color = colors[Number(b.dataset.color)];
    app.querySelectorAll("[data-color]").forEach((x) => {
      x.classList.toggle("on", x === b);
      x.setAttribute("aria-pressed", String(x === b));
    });
    document.getElementById("color-name").textContent = color.name;
    slides = slidesFor(color);
    current = 0;
    drawThumbs();
    holdUntil = Date.now() + 10000;
    showSlide(0);
  }));
  document.getElementById("size-guide")?.addEventListener("click", () => showSizeGuide(size));
  document.getElementById("add")?.addEventListener("click", () => {
    addToBag(p.id, size, color?.hex || "");
    flyToBag(stage.firstElementChild);
  });
  document.getElementById("buy")?.addEventListener("click", () => { addToBag(p.id, size, color?.hex || ""); location.hash = "#/checkout"; });
  reveal(app);
}

/** More from the same category, same collection first. */
function related(p) {
  const items = inCategory(p.category).filter((x) => x.id !== p.id).sort((a, b) => (b.collection === p.collection) - (a.collection === p.collection) || b.sort - a.sort).slice(0, 4);
  if (!items.length) return "";
  const cat = categoryOf(p);
  return `<section class="section"><div class="head"><span class="kicker">You may also like</span><h2>Similar ${esc(cat.name.toLowerCase())}</h2><a class="more" href="${categoryPath(cat.slug)}">See all</a></div>${grid(items)}</section>`;
}

function showSizeGuide(selected) {
  const chart = store.settings.size_chart || DEFAULT_SIZE_CHART;
  const cm = (inches) => Math.round(Number(inches) * 2.54);
  openModal(`<h2>Size guide</h2>
    <p class="muted small">Tee measurements in inches, with centimetres in brackets. Allow up to 1 inch of variation.</p>
    <div class="size-table-wrap"><table class="size-table">
      <thead><tr><th>Size</th><th>Fits chest</th><th>Tee chest</th><th>Length</th><th>Shoulder</th></tr></thead>
      <tbody>${chart.map((r) => `<tr class="${r.size === selected ? "on" : ""}"><th>${esc(r.size)}</th><td>${esc(r.fits)}</td><td>${esc(r.chest)} <small>(${cm(r.chest)})</small></td><td>${esc(r.length)} <small>(${cm(r.length)})</small></td><td>${esc(r.shoulder)} <small>(${cm(r.shoulder)})</small></td></tr>`).join("")}</tbody>
    </table></div>
    <ul class="assure">
      <li>Fits chest is your body measurement around the fullest part of your chest.</li>
      <li>Tee chest is the measurement around the tee, just below the arms.</li>
      <li>Between two sizes? Choose the larger one for a relaxed fit.</li>
    </ul>`);
}

function summary(lines) {
  const { subtotal, shipping, total } = totals(lines);
  return `<dl class="sum"><dt>Subtotal</dt><dd>${money(subtotal)}</dd><dt>Shipping</dt><dd>${shipping ? money(shipping) : "Free"}</dd><dt class="t">Total</dt><dd class="t">${money(total)}</dd></dl>`;
}

function pageBag() {
  const lines = bagLines();
  if (!lines.length) {
    app.innerHTML = `<section class="section first empty"><h2>Your bag is empty</h2><p class="muted">Sarees, custom tees and more are waiting for you.</p><div class="row"><a class="btn primary" href="#/shop">Start shopping</a><a class="btn" href="#/wishlist">Open your wishlist</a></div></section>`;
    return;
  }
  app.innerHTML = `<section class="section first two">
    <div><div class="head"><h2>Your bag</h2></div>
      ${lines.map((l) => `<div class="line" data-p="${esc(l.product_id)}" data-s="${esc(l.size)}" data-c="${esc(l.color || "")}">
        <div class="thumb">${l.choice?.images?.[0] ? `<img src="${esc(l.choice.images[0])}" alt="">` : productArt(l.product, { color: l.choice, hex: l.choice?.hex })}</div>
        <div class="grow"><h3>${esc(l.product.name)}</h3><p class="muted small">${esc(sizeText(l.size))}</p>${colorTag(l.choice?.name, l.choice?.hex)}<p class="price">${money(l.product.price_inr)}</p></div>
        <div class="qty"><button aria-label="Fewer" data-d="-1">−</button><span>${l.quantity}</span><button aria-label="More" data-d="1">+</button></div>
      </div>`).join("")}
    </div>
    <aside class="panel">${summary(lines)}<a class="btn primary wide" href="#/checkout">Checkout</a></aside>
  </section>`;
  app.querySelectorAll(".line").forEach((row) => row.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => {
    const line = bag.find((l) => l.product_id === row.dataset.p && l.size === row.dataset.s && (l.color || "") === row.dataset.c);
    line.quantity = Math.min(10, line.quantity + Number(b.dataset.d));
    bag = bag.filter((l) => l.quantity > 0);
    writeBag();
    pageBag();
  })));
}

function needSignIn(message) {
  app.innerHTML = `<section class="section first empty"><h2>Please sign in</h2><p class="muted">${esc(message)}</p><button class="btn primary" id="need">Sign in</button></section>`;
  document.getElementById("need").addEventListener("click", () => signInModal(message));
}

async function pageCheckout() {
  const lines = bagLines();
  if (!lines.length) return pageBag();
  if (!store.profile) return needSignIn("Sign in to finish your order. Your bag is saved.");
  const openedAt = location.hash;
  const [pastOrders, membership] = await Promise.all([api.myOrders(store.profile.id).catch(() => []), api.membership().catch(() => null)]);
  const previous = pastOrders[0] || {};
  if (location.hash !== openedAt) return;
  const memberTier = membership?.tier || null;
  const memberPct = memberTier?.discount_pct || 0;
  const memberSaving = memberSavingFor(lines, memberPct);
  let coupon = null;
  let options = paymentOptions(lines, 0, memberPct);
  const optionsHtml = (selected) => `<legend>How would you like to pay?</legend>
    ${options.map((o, i) => `<label class="pay-opt"><input type="radio" name="payment" value="${o.id}" ${(selected ? o.id === selected : !i) ? "checked" : ""}><span><strong>${esc(o.title)}</strong><small class="muted">${esc(o.note)}</small></span></label>`).join("") || '<p class="error">Payments are unavailable right now. Please contact us.</p>'}`;
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
      <div class="coupon-row">
        <label class="field"><span>Coupon code (optional)</span><input id="coupon-code" maxlength="20" autocomplete="off" autocapitalize="characters"></label>
        <button type="button" class="btn" id="coupon-apply">Apply</button>
      </div>
      <p class="small" id="coupon-msg" hidden></p>
      <fieldset class="pay-opts" id="pay-opts">${optionsHtml()}</fieldset>
      <p class="error" id="form-error" hidden></p>
      <button class="btn primary wide" id="place">Place order</button>
    </form>
    <aside class="panel">
      ${lines.map((l) => `<p class="row-between"><span>${esc(l.product.name)}${l.choice ? ` · ${esc(l.choice.name)}` : ""} · ${esc(l.size === FREE_SIZE ? "Free size" : l.size)} × ${l.quantity}</span><span>${money(l.quantity * l.product.price_inr)}</span></p>`).join("")}
      <div id="pay-sum"></div>
      <ul class="assure">
        <li>We confirm every payment before we prepare your order.</li>
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
    const box = document.getElementById("pay-sum");
    box.innerHTML = `<dl class="sum"><dt>Subtotal</dt><dd>${money(o.subtotal)}</dd>${o.coupon ? `<dt>Coupon ${esc(coupon.code)}</dt><dd>-${money(o.coupon)}</dd>` : ""}${o.member ? `<dt>${esc(memberTier.name)} member discount</dt><dd>-${money(o.member)}</dd>` : ""}<dt>Shipping</dt><dd>${o.shipping ? money(o.shipping) : "Free"}</dd>
      ${o.discount ? `<dt>UPI discount</dt><dd>-${money(o.discount)}</dd>` : ""}
      <dt class="t">Total</dt><dd class="t">${money(o.total)}</dd>
      ${o.now && o.now < o.total ? `<dt>Pay now by UPI</dt><dd>${money(o.now)}</dd><dt>Pay at delivery</dt><dd>${money(o.total - o.now)}</dd>` : ""}</dl>`;
  };
  showSum();
  form.addEventListener("change", (event) => { if (event.target.name === "payment") showSum(); });
  const couponInput = document.getElementById("coupon-code");
  const couponButton = document.getElementById("coupon-apply");
  const couponMessage = document.getElementById("coupon-msg");
  const setCoupon = (next, message, bad) => {
    const selected = form.elements.payment?.value;
    coupon = next;
    options = paymentOptions(lines, coupon?.discount || 0, memberPct);
    document.getElementById("pay-opts").innerHTML = optionsHtml(selected);
    couponInput.readOnly = Boolean(coupon);
    couponButton.textContent = coupon ? "Remove" : "Apply";
    couponMessage.textContent = message || "";
    couponMessage.hidden = !message;
    couponMessage.className = `small ${bad ? "error" : "coupon-good"}`;
    showSum();
  };
  couponButton.addEventListener("click", async () => {
    if (coupon) {
      couponInput.value = "";
      return setCoupon(null);
    }
    const code = couponInput.value.trim();
    if (!code) return setCoupon(null, "Enter a coupon code first.", true);
    couponButton.disabled = true;
    try {
      const result = await api.checkCoupon(code, lines.map((l) => ({ product_id: l.product_id, size: l.size, quantity: l.quantity })));
      if (memberSaving && result.discount <= memberSaving) {
        setCoupon(null, `Your ${memberTier.name} discount saves you more, so we've kept that. ${result.code} stays unused.`);
      } else {
        setCoupon({ code: result.code, discount: result.discount }, `${result.code} applied. You save ${money(result.discount)}${memberSaving ? ` instead of your ${memberTier.name} discount` : ""}.`);
      }
    } catch (error) {
      setCoupon(null, error.message, true);
    }
    couponButton.disabled = false;
  });
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
        lines.map((l) => ({ product_id: l.product_id, size: l.size, quantity: l.quantity, color: l.choice?.hex || "" })),
        { name: values.name.trim(), phone, line: values.line.trim(), city: values.city.trim(), state: values.state.trim(), pincode: values.pincode.trim() },
        values.note.trim(),
        chosen().id,
        coupon?.code || "",
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

const memberSavingFor = (lines, pct) => {
  const { subtotal } = totals(lines);
  return Math.max(Math.min(Math.floor(subtotal * pct / 100), subtotal - 1), 0);
};

function paymentOptions(lines, couponDiscount = 0, memberPct = 0) {
  const s = store.settings;
  const { subtotal } = totals(lines);
  const memberSaving = couponDiscount > memberSavingFor(lines, memberPct) ? 0 : memberSavingFor(lines, memberPct);
  const net = subtotal - couponDiscount - memberSaving;
  const shipping = net >= s.free_shipping_over ? 0 : s.shipping_inr;
  const full = net + shipping;
  const options = [];
  if (hasUpi()) {
    const discount = Math.floor(net * (s.prepaid_discount_pct || 0) / 100);
    options.push({ id: "prepaid", title: "Pay in full by UPI", note: discount ? `Save ${money(discount)}. Nothing to pay at delivery.` : "Nothing to pay at delivery.", discount, total: full - discount, now: full - discount });
    const advance = Math.min(s.advance_inr || 99, full);
    options.push({ id: "advance", title: `Pay ${money(advance)} advance by UPI`, note: `Pay ${money(full - advance)} in cash at delivery.`, discount: 0, total: full, now: advance });
  }
  if (hasCod()) options.push({ id: "cod", title: "Cash on delivery", note: "Pay the full amount when it arrives.", discount: 0, total: full, now: 0 });
  return options.map((o) => ({ ...o, subtotal, shipping, coupon: couponDiscount, member: memberSaving }));
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
  app.innerHTML = `<section class="section first two">
    <div class="panel pay-card">
      <span class="mono kicker">Order ${esc(order.order_no)}</span>
      <p class="pay-amount">${money(order.amount_due_now)}</p>
      ${order.payment_status === "failed" ? '<p class="error">We could not find your last payment. Please pay again, or contact us if money left your account.</p>' : ""}
      ${s.upi_qr_url ? `<div class="qr"><img src="${esc(s.upi_qr_url)}" alt="UPI QR code for AfterHours"></div>` : '<p class="muted">Open any UPI app, choose <strong>Pay to UPI ID</strong>, and paste the ID below.</p>'}
      <p class="pay-exact">${s.upi_qr_url ? "Scan, then enter" : "Enter"} exactly <strong>${money(order.amount_due_now)}</strong></p>
      <p class="muted small">Add ${esc(order.order_no)} in the payment note if your app allows it.</p>
      <div class="upi-copy"><span class="muted small">UPI ID</span><code>${esc(s.upi_id)}</code><button type="button" class="btn small" id="copy-upi">Copy</button></div>
    </div>
    <form id="ref-form" class="panel form">
      <div class="head"><h2>Paid? Confirm it.</h2></div>
      <p class="muted">After paying, find the <strong>12-digit UPI reference number</strong> (also called UTR or transaction ID) in your payment app's receipt.</p>
      <label class="field"><span>UPI reference number</span><input name="ref" inputmode="numeric" autocomplete="off" maxlength="16" required placeholder="12 digits"></label>
      <p class="error" id="ref-error" hidden></p>
      <button class="btn primary wide" id="ref-send">Submit payment</button>
      <a class="gate-back" href="#/orders">I'll pay later</a>
      <ul class="assure"><li>We check every payment before we prepare your order.</li><li>If we decline your order, we refund your payment.</li></ul>
    </form>
  </section>`;
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
  return `<ol class="track">${["Placed", "Accepted", "Preparing", "Dispatched", "Delivered"].map((label, i) => `<li class="${i <= step ? "done" : ""}">${label}</li>`).join("")}</ol>`;
}

function reviewForm(productId, name, existing) {
  let rating = existing?.rating || 0;
  openModal(`<h2>Rate ${esc(name)}</h2>
    <form id="review-form" class="form">
      <div class="star-pick" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n} star${n === 1 ? "" : "s"}">★</button>`).join("")}</div>
      <label class="field"><span>Your review (optional)</span><textarea name="comment" rows="3" maxlength="500">${esc(existing?.comment || "")}</textarea></label>
      <p class="muted small">Shown publicly with your first name.</p>
      <p class="error" id="review-error" hidden></p>
      <button class="btn primary wide" id="review-send">Post review</button>
    </form>`, (modal, close) => {
    const buttons = [...modal.querySelectorAll("[data-star]")];
    const paint = () => buttons.forEach((b) => b.classList.toggle("on", Number(b.dataset.star) <= rating));
    paint();
    buttons.forEach((b) => b.addEventListener("click", () => { rating = Number(b.dataset.star); paint(); }));
    modal.querySelector("#review-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const box = modal.querySelector("#review-error");
      const send = modal.querySelector("#review-send");
      box.hidden = true;
      if (!rating) { box.textContent = "Please choose a star rating."; box.hidden = false; return; }
      send.disabled = true;
      try {
        await api.submitReview(productId, rating, event.target.elements.comment.value.trim());
        store.reviews = await api.reviews();
        close();
        toast("Thanks for your review");
        pageOrders();
      } catch (error) {
        box.textContent = error.message;
        box.hidden = false;
        send.disabled = false;
      }
    });
  });
}

async function pageOrders() {
  if (!store.profile) return needSignIn("Sign in to see your orders.");
  const openedAt = location.hash;
  const [orders, myReviews] = await Promise.all([api.myOrders(store.profile.id), api.myReviews().catch(() => [])]);
  if (location.hash !== openedAt) return;
  const mine = new Map(myReviews.map((r) => [r.product_id, r]));
  if (!orders.length) {
    app.innerHTML = `<section class="section first empty"><h2>No orders yet</h2><a class="btn primary" href="#/shop">Start shopping</a></section>`;
    return;
  }
  app.innerHTML = `<section class="section first"><div class="head"><h2>Your orders</h2></div>
    <div class="stack">${orders.map((o) => `<article class="panel order">
      <header class="row-between"><div><span class="mono">${esc(o.order_no)}</span><p class="muted small">${when(o.created_at)}</p></div><span class="status ${o.status}">${STATUS[o.status].label}</span></header>
      ${timeline(o.status)}
      ${o.order_items.map((i) => `<p class="row-between"><span>${esc(i.name)}${i.color_name ? ` · ${esc(i.color_name)}` : ""} · ${esc(i.size === FREE_SIZE ? "Free size" : i.size)} × ${i.quantity}</span><span>${money(i.unit_price_inr * i.quantity)}</span></p>
        ${o.status === "delivered" && i.product_id ? `<button class="btn small" data-review="${esc(i.product_id)}" data-name="${esc(i.name)}">${mine.has(i.product_id) ? `Edit your review (${mine.get(i.product_id).rating}★)` : "Write a review"}</button>` : ""}`).join("")}
      ${o.coupon_code ? `<p class="row-between small"><span>Coupon ${esc(o.coupon_code)}</span><span>-${money(o.coupon_discount_inr)}</span></p>` : ""}
      ${o.member_tier ? `<p class="row-between small"><span>${esc(o.member_tier)} member discount</span><span>-${money(o.member_discount_inr)}</span></p>` : ""}
      <p class="row-between total"><span>Total</span><strong>${money(o.total_inr)}</strong></p>
      <div class="pay-line"><span class="pay-state ${esc(o.payment_status)}">${PAYMENT[o.payment_status]}</span>
        ${o.amount_due_now ? `<span class="muted small">UPI ${money(o.amount_due_now)}${paidLater(o) && !["rejected", "cancelled"].includes(o.status) ? `, then ${money(paidLater(o))} at delivery` : ""}</span>` : ""}
        ${["awaiting", "failed"].includes(o.payment_status) && o.status === "pending" ? `<a class="btn small primary" href="#/pay/${esc(o.id)}">${o.payment_status === "failed" ? "Try again" : "Pay now"}</a>` : ""}</div>
      ${o.courier_name ? `<p class="small">Shipped with ${esc(o.courier_name)}. <a class="inline-link" href="https://shiprocket.co/tracking/${encodeURIComponent(o.tracking_no)}" target="_blank" rel="noopener">Track parcel</a></p>` : ""}
      ${o.tracking_no ? `<p class="mono small">Tracking: ${esc(o.tracking_no)}${o.shipping_status ? ` · ${esc(o.shipping_status)}` : ""}</p>` : ""}
      ${o.cancel_reason ? `<p class="reason-note">Reason: ${esc(o.cancel_reason)}</p>` : ""}
      ${o.status === "pending" && ["cod", "awaiting", "failed"].includes(o.payment_status) ? `<button class="btn small" data-cancel="${esc(o.id)}">Cancel order</button>` : ""}
      ${o.status === "pending" && ["submitted", "verified"].includes(o.payment_status) ? `<p class="muted small">Need to cancel a paid order? <a class="inline-link" href="#/help">Contact us</a></p>` : ""}
    </article>`).join("")}</div></section>`;
  reveal(app);
  app.querySelectorAll("[data-review]").forEach((b) => b.addEventListener("click", () => reviewForm(b.dataset.review, b.dataset.name, mine.get(b.dataset.review))));
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
    ["How do I pay?", hasUpi() && hasCod() ? "By UPI when you order, with a small advance, or in cash when your parcel arrives." : hasUpi() ? "By UPI when you order. We confirm your payment before we prepare your order." : "Cash on delivery. You pay the delivery partner when your parcel arrives, and there is nothing to pay online."],
    ...(hasUpi() ? [["What if my order is declined after I pay?", "We refund your UPI payment."]] : []),
    ["Are sarees free size?", "Yes. A saree drapes to fit every body, so there is no size to choose. Each product page lists the length and whether a blouse piece is included."],
    ["Is a blouse piece included?", "It depends on the saree. Look for Blouse piece in the product details. When included, it comes unstitched so your tailor can fit it to you."],
    ["When is my tee printed?", "Each tee is printed after we accept your order, so it is made just for you."],
    ["How do I choose my tee size?", "Open the Size guide on any tee page and match your chest measurement. If you are between two sizes, choose the larger one for a relaxed fit."],
    ["Can I cancel my order?", `Yes, from your orders page, until we accept it. After that we start preparing it${s.support_phone || s.support_email ? ", so please contact us quickly" : ""}.`],
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
    ${s.business_address ? `<div class="panel seller"><span class="mono muted">Seller details</span><p><strong>AfterHours</strong><br>${esc(s.business_address)}</p></div>` : ""}
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
  app.innerHTML = `<section class="section first empty"><h2>We couldn't find that page</h2><a class="btn primary" href="#/">Back home</a></section>`;
}

/* ---------- router ---------- */
async function route() {
  const [, page = "", arg = "", arg2 = ""] = (location.hash || "#/").split("/");
  if (page === "sarees" || page === "tees") return location.replace(`#/c/${page === "sarees" ? "saree" : "tee"}${arg ? `/${arg}` : ""}`);
  await pageSwap(app, async () => {
    window.scrollTo({ top: 0, behavior: "instant" });
    try {
      if (page === "") await pageHome();
      else if (page === "shop") pageShop(decodeURIComponent(arg));
      else if (page === "c") pageCategory(decodeURIComponent(arg), decodeURIComponent(arg2));
      else if (page === "search") pageSearch(decodeURIComponent(arg));
      else if (page === "deals") pageDeals();
      else if (page === "wishlist") pageWishlist();
      else if (page === "p") pageProduct(arg);
      else if (page === "bag") pageBag();
      else if (page === "checkout") await pageCheckout();
      else if (page === "orders") await pageOrders();
      else if (page === "help") await pageHelp();
      else if (page === "membership") await pageMembership();
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
  [store.products, store.categories, store.settings, store.reviews, store.tiers] = await Promise.all([api.products(), api.categories().catch(() => []), api.settings(), api.reviews().catch(() => []), api.tiers().catch(() => [])]);
  setCategories(store.categories);
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
