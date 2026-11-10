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

export function openModal(html, onReady, onClose) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">
    <button class="modal-x" aria-label="Close" data-close>×</button>${html}</div></div>`;
  const close = () => {
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  root.querySelector(".modal-back").addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("modal-back")) close();
  });
  root.querySelector("[data-close]").addEventListener("click", close);
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
  printing: { label: "Printing", step: 2 },
  dispatched: { label: "Dispatched", step: 3 },
  delivered: { label: "Delivered", step: 4 },
  rejected: { label: "Declined", step: -1 },
  cancelled: { label: "Cancelled", step: -1 },
};

const SHAPE = "M205 58C236 92 364 92 395 58L470 86C512 118 556 164 590 212L512 288L466 244L470 660Q300 680 130 660L134 244L88 288L10 212C44 164 88 118 130 86Z";

function teeSvg(side) {
  const collar = side === "front"
    ? '<path d="M205 58C232 124 368 124 395 58" fill="none" stroke="#35353c" stroke-width="13"/><path d="M216 60C240 110 360 110 384 60C352 76 248 76 216 60Z" fill="#0b0b0d"/>'
    : '<path d="M205 58C236 86 364 86 395 58" fill="none" stroke="#35353c" stroke-width="13"/>';
  return `<svg class="tee-base" viewBox="0 0 600 700" aria-hidden="true">
    <defs>
      <linearGradient id="teeFill-${side}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#232329"/><stop offset=".55" stop-color="#17171b"/><stop offset="1" stop-color="#101013"/></linearGradient>
    </defs>
    <path d="${SHAPE}" fill="url(#teeFill-${side})" stroke="#2e2e35" stroke-width="2"/>
    <g fill="none" stroke="#fff" stroke-opacity=".035" stroke-width="10" stroke-linecap="round">
      <path d="M170 300C190 420 168 540 182 640"/><path d="M430 330C410 440 436 540 418 640"/><path d="M134 244C142 210 150 170 160 130"/><path d="M466 244C458 210 450 170 440 130"/>
    </g>
    ${collar}
  </svg>`;
}

/** A black tee with the print placed where it will sit on the real shirt. */
export function tee(product, side = "back", eager = false) {
  const src = side === "front" ? product.print_front : product.print_back;
  const art = src ? `<img class="tee-print ${side}" src="${esc(src)}" alt="" loading="${eager ? "eager" : "lazy"}">` : "";
  return `<div class="tee">${teeSvg(side)}${art}</div>`;
}
