// The collapsible side menu used by the customer store and the owner console.
import { esc } from "./ui.js";

const ICONS = {
  home: "M3 11 12 3l9 8M5 9.5V21h14V9.5",
  shop: "M8 3 3 7l3 3 2-1v12h8V9l2 1 3-3-5-4a4 4 0 0 1-8 0Z",
  bag: "M6 8h12l1 13H5L6 8Zm3 0V6a3 3 0 0 1 6 0v2",
  orders: "M4 7l8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.2 1-1.2 1.8m0 3h0",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Zm-3 9 2 2 4-4",
  tag: "M3 12V4h8l10 10-8 8L3 12Zm5-4h0",
  settings: "M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6",
  team: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10c0-4 3-6 7-6s7 2 7 6M16 3.5a4 4 0 0 1 0 7.5M18 15c2.500.7 4 2.800 4 6",
  chat: "M4 5h16v12H9l-5 4V5Z",
  star: "M12 3.500l2.700 5.500 6 .9-4.400 4.300 1 6-5.300-2.800-5.300 2.800 1-6L3.300 9.900l6-.9Z",
  store: "M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M10 20v-6h4v6",
  out: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  menu: "M4 6h16M4 12h16M4 18h16",
};

const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
const isMobile = () => matchMedia("(max-width: 820px)").matches;
const side = () => document.getElementById("side");

let storageKey = "";

function setOpen(open, remember = true) {
  document.body.classList.toggle("side-open", open);
  document.querySelectorAll("[data-side-toggle]").forEach((b) => b.setAttribute("aria-expanded", String(open)));
  if (!remember || isMobile()) return;
  try { localStorage.setItem(storageKey, open ? "1" : "0"); } catch { /* the menu still works for this visit */ }
}

export function mountSide(page, defaultOpen) {
  storageKey = `afterhours-side-${page}`;
  document.body.classList.add("has-side");
  let open = defaultOpen;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) open = saved === "1";
  } catch { /* use the default */ }
  setOpen(open && !isMobile(), false);
  if (document.body.dataset.sideBound) return;
  document.body.dataset.sideBound = "1";
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-side-toggle]")) return setOpen(!document.body.classList.contains("side-open"));
    if (event.target.closest(".side-back")) return setOpen(false);
    if (isMobile() && event.target.closest("#side a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isMobile() && document.body.classList.contains("side-open")) setOpen(false);
  });
}

export function unmountSide() {
  document.body.classList.remove("has-side", "side-open");
  if (side()) side().innerHTML = "";
}

export const sideToggle = () => `<button class="side-toggle" data-side-toggle aria-label="Toggle menu" aria-controls="side" aria-expanded="${document.body.classList.contains("side-open")}">${icon("menu")}</button>`;

/** links: [{href, label, icon, badge, external}], info: [{label, value, href}] */
export function drawSide({ account, links, info = [], signIn, signOut, fallbackHref }) {
  const current = location.hash || fallbackHref || "#/";
  const isActive = (href) => (href === "#/" ? current === "#/" : current === href || current.startsWith(`${href}/`));
  const person = account
    ? `<div class="side-person"><span class="side-avatar">${esc((account.name || account.email || "?")[0].toUpperCase())}</span>
        <span class="side-text"><strong>${esc(account.name || account.email)}</strong><small>${esc(account.tag || account.email || "")}</small></span></div>`
    : `<button class="btn primary wide side-signin">${icon("out")}<span class="side-text">Sign in</span></button>`;
  side().innerHTML = `<div class="side-inner">
    <div class="side-top">${person}</div>
    <nav class="side-links" aria-label="Main menu">${links.map((l) => `<a href="${esc(l.href)}" title="${esc(l.label)}" class="${isActive(l.href) ? "on" : ""}" ${l.external ? 'target="_blank" rel="noopener"' : ""}>
      ${icon(l.icon)}<span class="side-text">${esc(l.label)}</span>${l.badge ? `<b class="pill">${esc(l.badge)}</b>` : ""}</a>`).join("")}</nav>
    ${info.length ? `<dl class="side-info side-text">${info.map((row) => `<div><dt>${esc(row.label)}</dt><dd>${row.href ? `<a href="${esc(row.href)}">${esc(row.value)}</a>` : esc(row.value)}</dd></div>`).join("")}</dl>` : ""}
    ${account ? `<button class="side-out" title="Sign out">${icon("out")}<span class="side-text">Sign out</span></button>` : ""}
  </div>`;
  side().querySelector(".side-signin")?.addEventListener("click", signIn);
  side().querySelector(".side-out")?.addEventListener("click", signOut);
}
