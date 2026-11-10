// Animation helpers shared by the customer store and the owner console.
import { esc } from "./ui.js";

export const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- scroll reveal ---------- */
const REVEAL = ".head, .card, .tier, .steps li, .line, .panel, .stat, .prow, .lookbook img, .chips, .tabs";
let observer;

export function reveal(root) {
  if (calm || !("IntersectionObserver" in window)) return;
  observer ??= new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("in");
    observer.unobserve(entry.target);
  }), { rootMargin: "0px 0px -5% 0px", threshold: 0.04 });
  const seen = new Map();
  root.querySelectorAll(REVEAL).forEach((el) => {
    if (el.classList.contains("rv")) return;
    const index = seen.get(el.parentElement) || 0;
    seen.set(el.parentElement, index + 1);
    el.classList.add("rv");
    el.style.setProperty("--d", `${Math.min(index, 7) * 65}ms`);
    observer.observe(el);
  });
}

/* ---------- page change ---------- */
let firstPage = true;

export async function pageSwap(el, render) {
  if (calm || firstPage) {
    firstPage = false;
    await render();
    reveal(el);
    return;
  }
  el.classList.remove("entering");
  el.classList.add("leaving");
  await wait(150);
  await render();
  el.classList.remove("leaving");
  el.classList.add("entering");
  reveal(el);
  setTimeout(() => el.classList.remove("entering"), 480);
}

/* ---------- product card tilt ---------- */
export function bindTilt(root) {
  if (calm || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  root.addEventListener("pointermove", (event) => {
    const card = event.target.closest?.(".card");
    if (!card) return;
    const box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    card.style.setProperty("--ry", `${(x - 0.5) * 9}deg`);
    card.style.setProperty("--rx", `${(0.5 - y) * 9}deg`);
    card.style.setProperty("--mx", `${x * 100}%`);
    card.style.setProperty("--my", `${y * 100}%`);
  });
  root.addEventListener("pointerout", (event) => {
    const card = event.target.closest?.(".card");
    if (!card || card.contains(event.relatedTarget)) return;
    card.style.removeProperty("--ry");
    card.style.removeProperty("--rx");
  });
}

/* ---------- add to bag ---------- */
export function bumpBag() {
  if (calm) return;
  document.querySelector(".bag-link .pill")?.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.7)" }, { transform: "scale(1)" }],
    { duration: 420, easing: "cubic-bezier(.3,1.6,.5,1)" },
  );
}

export function flyToBag(source) {
  const target = document.querySelector(".bag-link");
  if (calm || !source || !target) return bumpBag();
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = source.cloneNode(true);
  Object.assign(ghost.style, { position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, margin: 0, zIndex: 70, pointerEvents: "none" });
  document.body.append(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  ghost.animate(
    [
      { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1 },
      { transform: `translate(${dx * 0.55}px,${dy * 0.3}px) scale(.55) rotate(-8deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px,${dy}px) scale(.05) rotate(14deg)`, opacity: 0.2 },
    ],
    { duration: 720, easing: "cubic-bezier(.5,0,.2,1)" },
  ).finished.finally(() => {
    ghost.remove();
    bumpBag();
  });
}

/* ---------- owner numbers ---------- */
export function countUp(root) {
  root.querySelectorAll("[data-n]").forEach((el) => {
    const target = Number(el.dataset.n);
    const show = (n) => { el.textContent = el.dataset.money ? `₹${Math.round(n).toLocaleString("en-IN")}` : String(Math.round(n)); };
    if (calm || !target) return show(target);
    const started = performance.now();
    const step = (now) => {
      const progress = Math.min((now - started) / 800, 1);
      show(target * (1 - (1 - progress) ** 3));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* ---------- login ---------- */
const LOGIN_KEY = "afterhours-signing-in";

export function markLogin() {
  try { sessionStorage.setItem(LOGIN_KEY, "1"); } catch { /* the welcome animation is optional */ }
}

export function consumeLogin() {
  try {
    const pending = sessionStorage.getItem(LOGIN_KEY) === "1";
    sessionStorage.removeItem(LOGIN_KEY);
    return pending;
  } catch {
    return false;
  }
}

/** The full-screen celebration after an order is placed. */
export function playOrderPlaced({ orderNo, total, note = "Pay cash when it arrives. We'll take it from here." }) {
  if (calm) return;
  const colors = ["#ff6a13", "#efe6d6", "#ff9a5a"];
  const drops = Array.from({ length: 34 }, (_, i) => {
    const angle = (i / 34) * Math.PI * 2 + Math.random() * 0.4;
    const reach = 26 + Math.random() * 34;
    return `<i style="--x:${(Math.cos(angle) * reach).toFixed(1)}vmin;--y:${(Math.sin(angle) * reach).toFixed(1)}vmin;--c:${colors[i % 3]};--s:${(6 + Math.random() * 16).toFixed(0)}px;--w:${(Math.random() * 0.25).toFixed(2)}s"></i>`;
  }).join("");
  const screen = document.createElement("div");
  screen.className = "punch win";
  screen.setAttribute("aria-hidden", "true");
  screen.innerHTML = `<div class="burst">${drops}</div>
    <svg class="tick" viewBox="0 0 80 80"><circle cx="40" cy="40" r="34"/><path d="M24 41l11 11 21-24"/></svg>
    <div class="punch-stamp">Order placed</div>
    <div class="punch-card mono"><span>${esc(orderNo)}</span><b>₹${Number(total).toLocaleString("en-IN")}</b></div>
    <p class="punch-name">${esc(note)}</p>`;
  document.body.append(screen);
  const finish = () => {
    screen.classList.add("out");
    setTimeout(() => screen.remove(), 560);
  };
  const timer = setTimeout(finish, 3400);
  screen.addEventListener("click", () => {
    clearTimeout(timer);
    finish();
  }, { once: true });
}

/** The full-screen punch-in played right after a successful sign-in. */
export function playLogin({ name, owner = false, title = "OWNER ACCESS" }) {
  if (calm) return;
  const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const screen = document.createElement("div");
  screen.className = `punch ${owner ? "owner" : ""}`;
  screen.setAttribute("aria-hidden", "true");
  screen.innerHTML = `<div class="punch-scan"></div>
    <img class="punch-logo" src="assets/brand/logo.webp" alt="">
    <div class="punch-card mono"><span>${owner ? esc(title) : "TIME CARD"}</span><b>${esc(time)}</b></div>
    <div class="punch-stamp">${owner ? "Access granted" : "Clocked in"}</div>
    <p class="punch-name">${esc(name)}</p>`;
  document.body.append(screen);
  const finish = () => {
    screen.classList.add("out");
    setTimeout(() => screen.remove(), 560);
  };
  const timer = setTimeout(finish, 2300);
  screen.addEventListener("click", () => {
    clearTimeout(timer);
    finish();
  }, { once: true });
}
