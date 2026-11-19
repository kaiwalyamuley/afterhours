// Small shared helpers: escaping, money, toasts, modals and the tee mockup.

export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

export const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export const when = (iso) => new Date(iso).toLocaleString("en-IN", {
  day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
});

export function toast(message, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), 4200);
}

/** Shows one button per reason. Resolves with the reason, or null if dismissed. */
export function pickReason(title, detail, reasons) {
  return new Promise((resolve) => {
    let chosen = null;
    openModal(`<h2>${esc(title)}</h2><p class="muted">${esc(detail)}</p>
      <div class="reasons">${reasons.map((r) => `<button class="reason-btn" data-reason="${esc(r)}">${esc(r)}</button>`).join("")}</div>`, (modal, close) => {
      modal.querySelectorAll("[data-reason]").forEach((button) => button.addEventListener("click", () => {
        chosen = button.dataset.reason;
        close();
      }));
    }, () => resolve(chosen));
  });
}

export function openModal(html, onReady, onClose, { className = "", canClose } = {}) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-back"><div class="modal ${className}" role="dialog" aria-modal="true">
    <button class="modal-x" aria-label="Close" data-close>×</button>${html}</div></div>`;
  const close = () => {
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const tryClose = () => { if (!canClose || canClose()) close(); };
  const onKey = (e) => { if (e.key === "Escape") tryClose(); };
  document.addEventListener("keydown", onKey);
  root.querySelector(".modal-back").addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("modal-back")) tryClose();
  });
  root.querySelector("[data-close]").addEventListener("click", tryClose);
  onReady?.(root.querySelector(".modal"), close);
  return close;
}

export const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>`;

export const DEFAULT_SIZE_CHART = [
  { size: "S", chest: 38, length: 26, shoulder: 17, fits: "34 to 36" },
  { size: "M", chest: 40, length: 27, shoulder: 18, fits: "36 to 38" },
  { size: "L", chest: 42, length: 28, shoulder: 19, fits: "38 to 40" },
  { size: "XL", chest: 44, length: 29, shoulder: 20, fits: "40 to 42" },
  { size: "XXL", chest: 46, length: 30, shoulder: 21, fits: "42 to 44" },
];

export const PAYMENT = {
  cod: "Cash on delivery",
  awaiting: "Waiting for your UPI payment",
  submitted: "Payment being checked",
  verified: "Payment received",
  failed: "Payment not found",
  refund_due: "Refund due",
  refunded: "Refunded",
};

export const paidLater = (order) => (order.payment_method === "cod" ? order.total_inr : order.total_inr - order.amount_due_now);

export const STATUS = {
  pending: { label: "Awaiting confirmation", step: 0 },
  accepted: { label: "Accepted", step: 1 },
  printing: { label: "Preparing", step: 2 },
  dispatched: { label: "Dispatched", step: 3 },
  delivered: { label: "Delivered", step: 4 },
  rejected: { label: "Declined", step: -1 },
  cancelled: { label: "Cancelled", step: -1 },
};

const SHAPE = "M205 58C236 92 364 92 395 58L470 86C512 118 556 164 590 212L512 288L466 244L470 660Q300 680 130 660L134 244L88 288L10 212C44 164 88 118 130 86Z";

function teeSvg(side, hex) {
  const rim = hex ? "rgba(0,0,0,.28)" : "#35353c";
  const collar = side === "front"
    ? `<path d="M205 58C232 124 368 124 395 58" fill="none" stroke="${rim}" stroke-width="13"/><path d="M216 60C240 110 360 110 384 60C352 76 248 76 216 60Z" fill="${hex ? "rgba(0,0,0,.45)" : "#0b0b0d"}"/>`
    : `<path d="M205 58C236 86 364 86 395 58" fill="none" stroke="${rim}" stroke-width="13"/>`;
  return `<svg class="tee-base" viewBox="0 0 600 700" aria-hidden="true">
    <defs>
      <linearGradient id="teeFill-${side}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#232329"/><stop offset=".55" stop-color="#17171b"/><stop offset="1" stop-color="#101013"/></linearGradient>
      <linearGradient id="teeShade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
    </defs>
    <path d="${SHAPE}" fill="${hex ? esc(hex) : `url(#teeFill-${side})`}" stroke="${hex ? "rgba(255,255,255,.16)" : "#2e2e35"}" stroke-width="2"/>
    ${hex ? `<path d="${SHAPE}" fill="url(#teeShade)"/>` : ""}
    <g fill="none" stroke="#fff" stroke-opacity=".035" stroke-width="10" stroke-linecap="round">
      <path d="M170 300C190 420 168 540 182 640"/><path d="M430 330C410 440 436 540 418 640"/><path d="M134 244C142 210 150 170 160 130"/><path d="M466 244C458 210 450 170 440 130"/>
    </g>
    ${collar}
  </svg>`;
}

/** A tee in the given colour (black if none), with the print where it will sit on the real shirt. */
export function tee(product, side = "back", eager = false, hex = "") {
  const src = side === "front" ? product.print_front : product.print_back;
  const art = src ? `<img class="tee-print ${side}" src="${esc(src)}" alt="" loading="${eager ? "eager" : "lazy"}">` : "";
  return `<div class="tee">${teeSvg(side, hex)}${art}</div>`;
}

/* ---------- sarees ---------- */
export const FREE_SIZE = "Free Size";
export const isSaree = (product) => product?.category === "saree";
export const SAREE_TYPES = ["Banarasi", "Kanjeevaram", "Paithani", "Chanderi", "Bandhani", "Patola", "Georgette", "Chiffon", "Cotton", "Linen", "Organza", "Printed"];
export const SAREE_OCCASIONS = ["Wedding", "Festive", "Puja", "Party", "Office", "Daily wear"];
export const SAREE_FABRICS = ["Pure silk", "Art silk", "Cotton", "Cotton silk", "Linen", "Georgette", "Chiffon", "Crepe", "Organza", "Net"];
/** Saree facts in the order customers read them. */
export const SAREE_FACTS = [
  ["saree_type", "Saree type"], ["fabric", "Fabric"], ["occasion", "Occasion"], ["work", "Work"],
  ["length_m", "Length"], ["blouse_piece", "Blouse piece"], ["care", "Care"],
];
export const factValue = (key, value) => {
  if (key === "length_m") return value ? `${value} metres` : "";
  if (key === "blouse_piece") return value === true ? "Included, unstitched" : value === false ? "Not included" : "";
  return value || "";
};
/** "Size M" for tees, "Free size" for sarees. */
export const sizeText = (size) => (size === FREE_SIZE ? "Free size" : `Size ${size}`);

/** A folded saree with a zari border, used until the owner adds real photos. */
export function sareeArt(hex = "#8C1C2B") {
  const base = esc(hex || "#8C1C2B");
  return `<svg class="saree-art" viewBox="0 0 600 700" aria-hidden="true">
    <defs>
      <linearGradient id="sareeSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
      <pattern id="sareeButi" width="46" height="46" patternUnits="userSpaceOnUse"><path d="M23 13c5 4 5 11 0 15-5-4-5-11 0-15Z" fill="#E9C46A" fill-opacity=".55"/><circle cx="0" cy="0" r="2.4" fill="#E9C46A" fill-opacity=".5"/><circle cx="46" cy="46" r="2.4" fill="#E9C46A" fill-opacity=".5"/></pattern>
      <pattern id="sareeZari" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="#C99A3B"/><path d="M0 14 14 0l14 14-14 14Z" fill="#E9C46A"/><circle cx="14" cy="14" r="3" fill="#8A6420"/></pattern>
    </defs>
    <g transform="translate(70 120)">
      <path d="M20 330h420l20 60H0Z" fill="${base}" opacity=".55"/>
      <rect x="0" y="390" width="460" height="70" rx="6" fill="${base}"/><rect x="0" y="390" width="460" height="70" rx="6" fill="url(#sareeSheen)"/>
      <rect x="0" y="440" width="460" height="20" fill="url(#sareeZari)"/>
      <rect x="20" y="210" width="420" height="120" rx="6" fill="${base}"/><rect x="20" y="210" width="420" height="120" rx="6" fill="url(#sareeButi)"/><rect x="20" y="210" width="420" height="120" rx="6" fill="url(#sareeSheen)"/>
      <rect x="20" y="300" width="420" height="30" fill="url(#sareeZari)"/>
      <rect x="40" y="60" width="380" height="150" rx="6" fill="${base}"/><rect x="40" y="60" width="380" height="150" rx="6" fill="url(#sareeButi)"/><rect x="40" y="60" width="380" height="150" rx="6" fill="url(#sareeSheen)"/>
      <rect x="40" y="170" width="380" height="40" fill="url(#sareeZari)"/>
      <path d="M40 60h380" stroke="#000" stroke-opacity=".15" stroke-width="3"/>
    </g>
  </svg>`;
}

/** First photo for a colour, then shared photos, else null. */
export const photoOf = (product, color) => color?.images?.[0] || product?.colors?.[0]?.images?.[0] || product?.gallery?.[0] || product?.model_image || null;

/** A product's picture: a photo when there is one, else the tee mockup or folded saree. */
export function productArt(product, { side = "back", hex = "", eager = false, color = null } = {}) {
  const pick = color || (product?.colors || []).find((c) => c.hex === hex) || product?.colors?.[0] || null;
  if (isSaree(product)) {
    const src = photoOf(product, pick);
    return src ? `<img class="photo" src="${esc(src)}" alt="" loading="${eager ? "eager" : "lazy"}">` : sareeArt(hex || pick?.hex);
  }
  return tee(product, side, eager, hex || pick?.hex || "");
}

/** The AfterHours wordmark, set in type so it reads on light and dark backgrounds. */
export const wordmark = (extra = "") => `<span class="wordmark ${extra}"><i aria-hidden="true">✦</i>After<b>Hours</b></span>`;

export const colorTag =(name, hex, showHex = false) => (hex ? `<span class="color-tag"><i style="--c:${esc(hex)}"></i>${esc(name)}${showHex ? ` <code>${esc(hex)}</code>` : ""}</span>` : "");
