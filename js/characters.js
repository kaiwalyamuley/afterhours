// The family chat: a small cartoon family on a sofa, chatting about what to buy
// from the store. Every message that mentions a product shows a tappable chip
// with its picture, name and price. Short, light, and only a strip of the page.
import { esc, money, categoryOf, isPrinted, productArt } from "./ui.js";

export const CHARACTERS = [
  { id: "dadi", name: "Dadi", role: "Grandmother, final word on everything" },
  { id: "papa", name: "Papa", role: "Holds the wallet" },
  { id: "mummy", name: "Mummy", role: "Plans every festival" },
  { id: "bunty", name: "Bunty", role: "Son, collects tees" },
  { id: "pinky", name: "Pinky", role: "Daughter, wishlists everything" },
];

/**
 * Each chat is a list of [speaker, text, product slot]. Slots: S = saree or other
 * traditional piece, T = printed tee, A = anything. {S.name}, {T.price}, {A.off}
 * and any detail key like {S.fabric} are filled from the chosen product. A chat is
 * only used when every placeholder has a value.
 */
const CHATS = [
  [["mummy", "Diwali is next week and I have nothing to wear."], ["dadi", "Take {S.name}. {S.fabric}, only {S.price}. Very graceful.", "S"], ["papa", "Only {S.price}? Add it before she changes her mind."]],
  [["bunty", "Papa, can I get {T.name}? They print it only after we order.", "T"], ["papa", "{T.price} for a tee nobody else has? Fine."], ["dadi", "Take two. One for photos, one for daily."]],
  [["papa", "{A.off}% off on {A.name}. Who needs it?", "A"], ["pinky", "Me!"], ["mummy", "Me!"], ["dadi", "Everybody calm down. Add it to the bag, then fight."]],
  [["pinky", "Cousin's wedding! I'm thinking {S.name}.", "S"], ["mummy", "That {S.border}? Perfect for the sangeet."], ["dadi", "Good choice. Now find me one too."]],
  [["pinky", "Already wishlisted {A.name}.", "A"], ["bunty", "You wishlist everything."], ["pinky", "It's {A.price}. I have taste AND a budget."]],
  [["dadi", "I don't trust paying online."], ["papa", "Maa, there's cash on delivery. Pay when {A.name} reaches home.", "A"], ["dadi", "Then order it. And one for me."]],
  [["mummy", "Family photo on Sunday. Matching outfits?"], ["bunty", "I'll wear {T.name}.", "T"], ["mummy", "And I'll wear {S.name}.", "S"], ["papa", "And I'll take the photo. Cheaper."]],
  [["bunty", "Which colour, {T.colour} or something new?"], ["pinky", "{T.colour}. Trust me.", "T"], ["papa", "{T.price}. Approved."]],
  [["dadi", "In my time we went to ten shops for one {A.category}."], ["pinky", "Dadi, {A.name} is right here, {A.price}.", "A"], ["dadi", "Hmm. Times have changed. Add to bag."]],
];

/** Values a message can use for one product. */
function valuesFor(p) {
  const values = {
    name: p.name,
    price: money(p.price_inr),
    category: categoryOf(p).name.toLowerCase().replace(/s$/, ""),
    collection: p.collection,
    colour: p.colors?.[0]?.name?.toLowerCase() || "",
    off: p.compare_at_inr > p.price_inr ? String(Math.round((1 - p.price_inr / p.compare_at_inr) * 100)) : "",
  };
  (categoryOf(p).fields || []).forEach((f) => {
    const v = p.details?.[f.key];
    if (v !== undefined && v !== null && v !== "" && typeof v !== "boolean") values[f.key] = String(v).toLowerCase();
  });
  return values;
}

/** Fills one message. Returns null when a value is missing or would just repeat the name. */
function fill(text, picks) {
  let ok = true;
  const out = text.replace(/\{([STA])\.(\w+)\}/g, (_, slot, key) => {
    const p = picks[slot];
    const value = p ? valuesFor(p)[key] : "";
    const repeats = p && key !== "name" && key !== "price" && String(value || "").split(/\W+/).some((w) => w.length > 3 && p.name.toLowerCase().includes(w));
    if (!value || repeats) ok = false;
    return value || "";
  });
  if (!ok) return null;
  return out.replace(/^./, (c) => c.toUpperCase()).replace(/([.!?] )([a-z])/g, (_, gap, c) => gap + c.toUpperCase());
}

/** Builds the conversations the strip will play, using the chosen or newest products. */
export function buildChats(products, config = {}) {
  const chosen = (config.products || []).map((slug) => products.find((p) => p.slug === slug)).filter(Boolean);
  const pool = (chosen.length ? chosen : [...products].sort((a, b) => b.sort - a.sort)).slice(0, 12);
  const kinds = {
    // Sarees first, then other traditional pieces.
    S: [...pool.filter((p) => categoryOf(p).art === "saree"), ...pool.filter((p) => !isPrinted(p) && categoryOf(p).art !== "saree")],
    T: pool.filter((p) => isPrinted(p)),
    A: pool,
  };
  const turn = { S: 0, T: 0, A: 0 };
  const chats = [];
  for (let round = 0; round < 2 && chats.length < 8; round += 1) {
    CHATS.forEach((chat) => {
      const slots = [...new Set(chat.flatMap(([, text, slot]) => [slot, ...[...text.matchAll(/\{([STA])\./g)].map((m) => m[1])]).filter(Boolean))];
      if (slots.some((s) => !kinds[s].length)) return;
      const picks = {};
      slots.forEach((s) => { picks[s] = kinds[s][(turn[s] + round) % kinds[s].length]; });
      const lines = chat.map(([who, text, slot]) => ({ who, text: fill(text, picks), product: slot ? picks[slot] : null }));
      if (lines.some((l) => !l.text)) return;
      const key = lines.map((l) => l.text).join("|");
      if (chats.some((c) => c.key === key)) return;
      slots.forEach((s) => { turn[s] += 1; });
      chats.push({ key, lines });
    });
  }
  return chats.slice(0, 8);
}

/* ---------- the family on a sofa ---------- */
const SKIN = ["#c68a5e", "#b47a52", "#d29a72", "#bf8559", "#d9a07a"];
const face = (cx, cy, r, skin, extra = "") => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${skin}"/>
  ${extra}
  <g class="eyes"><circle cx="${cx - r * 0.35}" cy="${cy}" r="${r * 0.11}" fill="#2b1518"/><circle cx="${cx + r * 0.35}" cy="${cy}" r="${r * 0.11}" fill="#2b1518"/></g>
  <circle cx="${cx - r * 0.55}" cy="${cy + r * 0.35}" r="${r * 0.16}" fill="#e8737a" opacity=".35"/><circle cx="${cx + r * 0.55}" cy="${cy + r * 0.35}" r="${r * 0.16}" fill="#e8737a" opacity=".35"/>
  <g class="mouth"><path d="M${cx - r * 0.25} ${cy + r * 0.42}q${r * 0.25} ${r * 0.28} ${r * 0.5} 0" fill="#7a1e2b"/></g>`;

function sofa() {
  return `<svg class="family-svg" viewBox="0 0 340 170" role="img" aria-label="A cartoon family sitting on a sofa">
    <defs><linearGradient id="sofaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b2a3a"/><stop offset="1" stop-color="#6e1522"/></linearGradient></defs>
    <rect x="18" y="64" width="304" height="72" rx="22" fill="url(#sofaFill)"/>
    <rect x="6" y="92" width="40" height="62" rx="16" fill="#7d1a28"/><rect x="294" y="92" width="40" height="62" rx="16" fill="#7d1a28"/>
    <rect x="30" y="118" width="280" height="36" rx="14" fill="#8c1c2b"/>
    <path d="M40 154v12M300 154v12" stroke="#4a0d16" stroke-width="8" stroke-linecap="round"/>
    <g class="fam dadi" data-who="dadi">
      <path d="M38 150c0-30 12-46 30-46s30 16 30 46Z" fill="#f2efe6"/><path d="M48 116c10 18 30 22 46 30" stroke="#b8862f" stroke-width="5" fill="none"/>
      <g class="fam-head"><circle cx="68" cy="70" r="11" fill="#d8d4ce"/>${face(68, 86, 18, SKIN[0], '<path d="M50 84c0-14 8-22 18-22s18 8 18 22c-6-8-12-12-18-12s-12 4-18 12Z" fill="#d8d4ce"/><g fill="none" stroke="#5a3b2e" stroke-width="1.6"><circle cx="61.7" cy="86" r="5"/><circle cx="74.3" cy="86" r="5"/><path d="M66.7 86h2.6"/></g>')}</g>
    </g>
    <g class="fam papa" data-who="papa">
      <path d="M98 150c0-34 14-52 34-52s34 18 34 52Z" fill="#e9c46a"/><path d="M132 100v34" stroke="#b8862f" stroke-width="2" stroke-dasharray="2 5"/>
      <g class="fam-head">${face(132, 76, 19, SKIN[1], '<path d="M113 72c0-14 8-22 19-22s19 8 19 22c-8-6-30-6-38 0Z" fill="#2b1a14"/><path d="M124 85q8 5 16 0q-8 2-16 0Z" fill="#2b1a14"/>')}</g>
    </g>
    <g class="fam mummy" data-who="mummy">
      <path d="M164 150c0-32 13-50 32-50s32 18 32 50Z" fill="#2f8f83"/><path d="M214 106c-18 12-28 26-34 44" stroke="#e9c46a" stroke-width="7" fill="none"/>
      <g class="fam-head"><circle cx="196" cy="58" r="9" fill="#2b1a14"/>${face(196, 78, 18, SKIN[2], '<path d="M178 76c0-14 8-22 18-22s18 8 18 22c-6-6-12-10-18-10s-12 4-18 10Z" fill="#2b1a14"/><circle cx="196" cy="68" r="2.2" fill="#c0392b"/>')}</g>
    </g>
    <g class="fam bunty" data-who="bunty">
      <path d="M226 150c0-28 11-42 26-42s26 14 26 42Z" fill="#1b1012"/><rect x="242" y="122" width="20" height="16" rx="3" fill="#e9c46a" opacity=".8"/>
      <g class="fam-head">${face(252, 92, 15, SKIN[3], '<path d="M237 90c0-12 7-18 15-18s15 6 15 18c-10-5-20-5-30 0Z" fill="#8c1c2b"/><path d="M262 82l12 2-3 5-10-2Z" fill="#6e1522"/>')}</g>
    </g>
    <g class="fam pinky" data-who="pinky">
      <path d="M276 150c0-26 10-40 24-40s24 14 24 40Z" fill="#e8737a"/><rect x="310" y="112" width="11" height="18" rx="3" fill="#2b1518"/>
      <g class="fam-head"><path d="M312 86c8 4 10 16 6 26-2-8-6-14-10-18Z" fill="#2b1a14"/>${face(300, 94, 14, SKIN[4], '<path d="M286 94c0-12 6-18 14-18s14 6 14 16c-6-2-12-6-14-10-2 6-8 10-14 12Z" fill="#2b1a14"/><circle cx="311" cy="80" r="3" fill="#e9c46a"/>')}</g>
    </g>
  </svg>`;
}

const nameOf = (id, config) => (config.names?.[id] || "").trim() || CHARACTERS.find((c) => c.id === id).name;

/** The home page strip. Returns "" when there is nothing to chat about. */
export function charactersSection(products, config = {}) {
  if (!buildChats(products, config).length) return "";
  return `<section class="section family" aria-label="${esc(config.title || "Family shopping chat")}">
    <div class="family-box">
      <div class="family-scene">${sofa()}<p class="family-title"><span class="kicker">Family chat</span><b>${esc(config.title || "What should we buy?")}</b></p></div>
      <div class="family-chat" id="family-chat" aria-live="polite"></div>
    </div>
  </section>`;
}

/** Plays the chats one message at a time, keeping only the last few on screen. */
export function bindCharacters(root, products, config = {}, calm = false) {
  const box = root.querySelector("#family-chat");
  if (!box) return;
  const chats = buildChats(products, config);
  const scene = root.querySelector(".family-svg");
  const say = (who) => scene?.querySelectorAll(".fam").forEach((g) => g.classList.toggle("speaking", g.dataset.who === who));
  const bubble = ({ who, text, product: p }) => `<div class="msg ${who}">
    <span class="msg-who">${esc(nameOf(who, config))}</span>
    <p>${esc(text)}</p>
    ${p ? `<a class="msg-chip" href="#/p/${esc(p.slug)}"><span class="chip-pic ${isPrinted(p) ? "is-tee" : ""}">${productArt(p)}</span><span class="chip-text"><b>${esc(p.name)}</b><small>${money(p.price_inr)}${p.compare_at_inr > p.price_inr ? ` · ${Math.round((1 - p.price_inr / p.compare_at_inr) * 100)}% off` : ""}</small></span><em>View</em></a>` : ""}
  </div>`;
  if (calm) {
    box.innerHTML = chats[0].lines.map(bubble).join("");
    return;
  }
  let chat = 0;
  let line = 0;
  let paused = false;
  const container = root.querySelector(".family-box");
  container.addEventListener("pointerenter", () => { paused = true; });
  container.addEventListener("pointerleave", () => { paused = false; });
  const step = () => {
    if (!box.isConnected) return;
    if (paused || document.hidden) return setTimeout(step, 800);
    const current = chats[chat];
    if (line >= current.lines.length) {
      chat = (chat + 1) % chats.length;
      line = 0;
      say("");
      box.classList.add("clearing");
      return setTimeout(() => { box.classList.remove("clearing"); box.innerHTML = ""; step(); }, 2600);
    }
    const message = current.lines[line];
    say(message.who);
    const trim = () => {
      const used = () => [...box.children].reduce((sum, el) => sum + el.offsetHeight + 8, -8);
      while (box.children.length > 1 && used() > box.clientHeight) box.firstElementChild.remove();
    };
    box.insertAdjacentHTML("beforeend", `<div class="msg typing ${message.who}"><span class="msg-who">${esc(nameOf(message.who, config))}</span><p><i></i><i></i><i></i></p></div>`);
    trim();
    setTimeout(() => {
      if (!box.isConnected) return;
      box.lastElementChild.outerHTML = bubble(message);
      // Drop the oldest messages so nothing is cut off at the top.
      trim();
      line += 1;
      setTimeout(step, 2200 + message.text.length * 25);
    }, 900);
  };
  step();
}
