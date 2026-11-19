// The AfterHours Gang: three cartoon characters on the home page who show off
// real products, wearing their colours and prints, with lines built from each
// product's details. The owner can rename them, rewrite their lines and pick
// which products they present.
import { esc, money, categoryOf, specsOf, isPrinted, isSaree, productArt } from "./ui.js";

export const CHARACTERS = [
  { id: "mausi", name: "Mausi", role: "Has been to 200 weddings", likes: "saree" },
  { id: "bunty", name: "Bunty", role: "College legend, tee collector", likes: "tee" },
  { id: "pinky", name: "Pinky", role: "Wishlists everything", likes: "any" },
];

/** Lines use {placeholders}. A line is only used when every placeholder has a value. */
export const DEFAULT_LINES = {
  mausi: [
    "Arre beta! {name} in {fabric}? At {price}, the whole shaadi will ask where you got it.",
    "That {border}! And {fabric}... I have seen 200 weddings and this {name} wins.",
    "{off}% off on {name}! In my time we bargained for hours. Now AfterHours does it for you.",
    "Only {price} for {name}? Put it in the bag before your cousin sees it.",
  ],
  bunty: [
    "Bro. {name}. {fit} fit, printed only after you order. Nobody else has it yet.",
    "{name} at {price}? My whole college group chat is going to be jealous.",
    "{off}% off on {name}. I'm not saying buy two... but buy two.",
    "Wearing {name} to the canteen. Attendance: optional. Drip: mandatory.",
  ],
  pinky: [
    "Okay but {name} in {colour}? Instant profile picture. Only {price}!",
    "Wishlisted {name} in 0.2 seconds. {category} goals!",
    "POV: you just found {name} for {price}. Add to bag before Mausi does.",
    "{name} is giving main character energy. {price} well spent.",
  ],
};

const SKIN = { mausi: "#c68a5e", bunty: "#b47a52", pinky: "#d9a07a" };

/** Values a line can use for one product. */
function valuesFor(p) {
  const values = {
    name: p.name,
    price: money(p.price_inr),
    category: categoryOf(p).name,
    collection: p.collection,
    colour: p.colors?.[0]?.name?.toLowerCase() || "",
    off: p.compare_at_inr > p.price_inr ? String(Math.round((1 - p.price_inr / p.compare_at_inr) * 100)) : "",
  };
  (categoryOf(p).fields || []).forEach((f) => {
    const v = p.details?.[f.key];
    if (v !== undefined && v !== null && v !== "" && typeof v !== "boolean") values[f.key] = String(v).toLowerCase();
  });
  if (values.fabric) values.fabric = values.fabric.replace(/^./, (c) => c.toLowerCase());
  return values;
}

export function fillLine(template, p) {
  const values = valuesFor(p);
  const name = p.name.toLowerCase();
  let ok = true;
  const text = template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = values[key];
    // Skip a line that would repeat itself, like "Georgette saree in georgette".
    const repeats = key !== "name" && key !== "price" && String(value || "").toLowerCase().split(/\W+/).some((w) => w.length > 3 && name.includes(w));
    if (!value || repeats) ok = false;
    return value || "";
  });
  if (ok && /\b(\w+) \1\b/i.test(text)) ok = false;
  return ok ? text.replace(/^./, (c) => c.toUpperCase()).replace(/([.!?] )([a-z])/g, (_, gap, c) => gap + c.toUpperCase()) : null;
}

/** The first line that works for this product, starting from a rotating index. */
function lineFor(id, p, offset, custom, usedLines = new Set()) {
  const own = (custom || []).filter((l) => l.trim());
  const list = own.length ? own : DEFAULT_LINES[id];
  let fallback = null;
  for (let i = 0; i < list.length; i += 1) {
    const template = list[(offset + i) % list.length];
    const text = fillLine(template, p);
    if (!text) continue;
    if (!usedLines.has(template)) { usedLines.add(template); return text; }
    fallback ??= text;
  }
  if (fallback) return fallback;
  return `Have you seen ${p.name}? Only ${money(p.price_inr)}!`;
}

/* ---------- drawings ---------- */
const eyes = (y, lx = 92, rx = 128) => `<g class="eyes"><ellipse cx="${lx}" cy="${y}" rx="4.5" ry="5.5" fill="#2b1518"/><ellipse cx="${rx}" cy="${y}" rx="4.5" ry="5.5" fill="#2b1518"/><circle cx="${lx + 1.5}" cy="${y - 2}" r="1.4" fill="#fff"/><circle cx="${rx + 1.5}" cy="${y - 2}" r="1.4" fill="#fff"/></g>`;
const mouth = (y) => `<g class="mouth"><path d="M98 ${y}q12 12 24 0q-12 5-24 0Z" fill="#7a1e2b"/><path d="M103 ${y + 4}q7 4 14 0" fill="none" stroke="#e8737a" stroke-width="3" stroke-linecap="round"/></g>`;
const cheeks = (y) => `<circle cx="80" cy="${y}" r="7" fill="#e8737a" opacity=".35"/><circle cx="140" cy="${y}" r="7" fill="#e8737a" opacity=".35"/>`;

function mausi(p) {
  const saree = p && isSaree(p) ? p.colors?.[0]?.hex || "#8c1c2b" : "#8c1c2b";
  const s = SKIN.mausi;
  return `<svg class="char-svg" viewBox="0 0 220 300" aria-hidden="true">
    <g class="char-body">
      <path d="M36 300C40 214 68 172 110 168c42 4 70 46 74 132Z" fill="${esc(saree)}"/>
      <path d="M36 300C40 214 68 172 110 168c42 4 70 46 74 132Z" fill="url(#charSheen)"/>
      <path d="M150 182c-40 24-66 62-78 118" fill="none" stroke="#e9c46a" stroke-width="14"/>
      <path d="M150 182c-40 24-66 62-78 118" fill="none" stroke="#b8862f" stroke-width="3" stroke-dasharray="2 6"/>
      <path d="M86 176q24 22 48 0" fill="#d4a017"/>
      <rect x="99" y="138" width="22" height="34" rx="8" fill="${s}"/>
    </g>
    <g class="char-head">
      <circle cx="110" cy="44" r="22" fill="#2b1a14"/><circle cx="110" cy="44" r="6" fill="#e9c46a"/>
      <circle cx="110" cy="96" r="52" fill="${s}"/>
      <path d="M58 92c0-34 24-52 52-52s52 18 52 52c-10-18-30-30-52-30-6 0-10 4-10 4s-4-4-10-4c-14 0-26 12-32 30Z" fill="#2b1a14"/>
      <path d="M118 46c10 2 24 10 30 24" fill="none" stroke="#a49a92" stroke-width="5" stroke-linecap="round"/>
      <circle cx="56" cy="112" r="6" fill="#e9c46a"/><circle cx="164" cy="112" r="6" fill="#e9c46a"/>
      <circle cx="110" cy="72" r="4.5" fill="#c0392b"/>
      ${eyes(98)}
      <g fill="none" stroke="#5a3b2e" stroke-width="3"><circle cx="92" cy="98" r="13" fill="#fff" fill-opacity=".18"/><circle cx="128" cy="98" r="13" fill="#fff" fill-opacity=".18"/><path d="M105 97h10"/></g>
      ${cheeks(118)}${mouth(122)}
    </g>
  </svg>`;
}

function bunty(p) {
  const tee = p && isPrinted(p) ? p.colors?.[0]?.hex || "#111" : "#111";
  const print = p && isPrinted(p) ? p.print_back || p.print_front : "";
  const s = SKIN.bunty;
  return `<svg class="char-svg" viewBox="0 0 220 300" aria-hidden="true">
    <g class="char-body">
      <path d="M30 300c2-70 22-112 52-124l28 10 28-10c30 12 50 54 52 124Z" fill="${esc(tee)}"/>
      <path d="M30 300c2-70 22-112 52-124l28 10 28-10c30 12 50 54 52 124Z" fill="url(#charSheen)"/>
      <path d="M90 178q20 16 40 0" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="6"/>
      ${print ? `<image href="${esc(print)}" x="72" y="196" width="76" height="92" preserveAspectRatio="xMidYMid meet"/>` : '<text x="110" y="250" text-anchor="middle" font-family="Playfair Display, serif" font-size="22" fill="#e9c46a" font-style="italic">AH</text>'}
      <rect x="99" y="140" width="22" height="34" rx="8" fill="${s}"/>
    </g>
    <g class="char-head">
      <circle cx="110" cy="98" r="50" fill="${s}"/>
      <path d="M60 86c4-30 26-44 50-44s46 14 50 44c-30-12-70-12-100 0Z" fill="#8c1c2b"/>
      <path d="M60 86c30-10 70-10 100 0" fill="none" stroke="#e9c46a" stroke-width="4"/>
      <path d="M150 70l26 4-6 12-24-6Z" fill="#6e1522"/>
      <g class="eyes shades"><rect x="76" y="90" width="30" height="18" rx="7" fill="#1b1012"/><rect x="114" y="90" width="30" height="18" rx="7" fill="#1b1012"/><path d="M106 96h8" stroke="#1b1012" stroke-width="4"/><path d="M82 94l8-2" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/></g>
      <path d="M92 128q18 6 36 0" fill="none" stroke="#2b1518" stroke-opacity=".25" stroke-width="10" stroke-linecap="round"/>
      ${mouth(122)}
    </g>
  </svg>`;
}

function pinky(p) {
  const s = SKIN.pinky;
  const top = p && !isPrinted(p) && !isSaree(p) ? p.colors?.[0]?.hex || "#2f8f83" : "#2f8f83";
  return `<svg class="char-svg" viewBox="0 0 220 300" aria-hidden="true">
    <g class="char-body">
      <path d="M38 300c4-72 28-114 72-118 44 4 68 46 72 118Z" fill="${esc(top)}"/>
      <path d="M38 300c4-72 28-114 72-118 44 4 68 46 72 118Z" fill="url(#charSheen)"/>
      <path d="M92 184l18 22 18-22" fill="none" stroke="#e9c46a" stroke-width="4"/>
      <rect x="99" y="140" width="22" height="34" rx="8" fill="${s}"/>
      <g class="phone"><rect x="150" y="150" width="34" height="58" rx="7" fill="#2b1518"/><rect x="154" y="156" width="26" height="44" rx="4" fill="#f3dfb1"/><path d="M167 172c-4-6-12-2-8 4l8 8 8-8c4-6-4-10-8-4Z" fill="#e8737a"/><circle cx="160" cy="218" r="13" fill="${s}"/></g>
    </g>
    <g class="char-head">
      <path d="M150 70c26 8 34 40 22 70-6-20-14-36-30-44Z" fill="#2b1a14"/>
      <circle cx="110" cy="96" r="50" fill="${s}"/>
      <path d="M60 94c-2-34 20-54 50-54s52 18 50 50c-18-4-36-16-44-30-8 18-30 30-56 34Z" fill="#2b1a14"/>
      <circle cx="148" cy="62" r="7" fill="#e8737a"/><circle cx="148" cy="62" r="3" fill="#fff"/>
      ${eyes(100)}
      <path d="M84 88l14-3M122 85l14 3" stroke="#2b1a14" stroke-width="3" stroke-linecap="round"/>
      ${cheeks(118)}${mouth(122)}
    </g>
  </svg>`;
}

const DRAW = { mausi, bunty, pinky };
const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="charSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs></svg>';

/** Pairs each product with the character who likes it most. */
export function buildScenes(products, config = {}) {
  const chosen = (config.products || []).map((slug) => products.find((p) => p.slug === slug)).filter(Boolean);
  const pool = (chosen.length ? chosen : [...products].sort((a, b) => b.sort - a.sort)).slice(0, 8);
  const used = { mausi: 0, bunty: 0, pinky: 0 };
  const usedLines = { mausi: new Set(), bunty: new Set(), pinky: new Set() };
  const seen = { saree: 0, tee: 0, other: 0 };
  return pool.map((p) => {
    // Each kind goes to its own character first; every third one goes to Pinky for variety.
    const kind = isSaree(p) ? "saree" : isPrinted(p) ? "tee" : "other";
    const n = seen[kind]++;
    const id = kind === "other" ? (n % 2 ? "mausi" : "pinky") : n % 3 === 2 ? "pinky" : kind === "saree" ? "mausi" : "bunty";
    const offset = used[id]++;
    return { id, product: p, line: lineFor(id, p, offset, config.lines?.[id], usedLines[id]) };
  });
}

const nameOf = (id, config) => (config.names?.[id] || "").trim() || CHARACTERS.find((c) => c.id === id).name;

/** The home page section. Returns "" when there is nothing to show. */
export function charactersSection(products, config = {}) {
  const scenes = buildScenes(products, config);
  if (!scenes.length) return "";
  return `<section class="section gang" aria-label="${esc(config.title || "The AfterHours Gang")}">
    ${DEFS}
    <div class="head center"><span class="kicker">Meet the gang</span><h2>${esc(config.title || "The AfterHours Gang picks")}</h2></div>
    <div class="gang-stage" id="gang-stage"></div>
    <div class="gang-dots" role="tablist" aria-label="Choose a pick">${scenes.map((s, i) => `<button role="tab" class="gang-dot ${i ? "" : "on"}" data-scene="${i}" aria-label="${esc(nameOf(s.id, config))} on ${esc(s.product.name)}"></button>`).join("")}</div>
  </section>`;
}

/** Draws one scene and rotates through them. */
export function bindCharacters(root, products, config = {}, calm = false) {
  const stage = root.querySelector("#gang-stage");
  if (!stage) return;
  const scenes = buildScenes(products, config);
  let index = 0;
  let paused = false;
  const show = (i) => {
    index = (i + scenes.length) % scenes.length;
    const { id, product: p, line } = scenes[index];
    const who = CHARACTERS.find((c) => c.id === id);
    const specs = specsOf(p).slice(0, 3);
    const off = p.compare_at_inr > p.price_inr ? Math.round((1 - p.price_inr / p.compare_at_inr) * 100) : 0;
    stage.innerHTML = `<div class="gang-scene ${id}">
      <div class="gang-char talking">${DRAW[id](p)}<div class="gang-name"><b>${esc(nameOf(id, config))}</b><small>${esc(who.role)}</small></div></div>
      <div class="gang-bubble" aria-live="polite"><p>${esc(line)}</p></div>
      <a class="gang-card" href="#/p/${esc(p.slug)}">
        <div class="gang-pic ${isPrinted(p) ? "is-tee" : ""}">${productArt(p, { eager: true })}</div>
        <div class="gang-info"><span class="card-cat">${esc(categoryOf(p).name)}</span><h3>${esc(p.name)}</h3>
          <p class="price">${money(p.price_inr)}${off ? ` <s>${money(p.compare_at_inr)}</s> <em>${off}% off</em>` : ""}</p>
          ${specs.length ? `<dl class="gang-specs">${specs.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
          <span class="btn primary small">Shop this</span></div>
      </a>
    </div>`;
    root.querySelectorAll("[data-scene]").forEach((b, n) => b.classList.toggle("on", n === index));
    setTimeout(() => stage.querySelector(".gang-char")?.classList.remove("talking"), 2600);
  };
  root.querySelectorAll("[data-scene]").forEach((b) => b.addEventListener("click", () => {
    paused = true;
    show(Number(b.dataset.scene));
  }));
  stage.addEventListener("pointerenter", () => { paused = true; });
  stage.addEventListener("pointerleave", () => { paused = false; });
  show(0);
  if (calm || scenes.length < 2) return;
  const timer = setInterval(() => {
    if (!stage.isConnected) return clearInterval(timer);
    if (!paused && !document.hidden) show(index + 1);
  }, 7000);
}
