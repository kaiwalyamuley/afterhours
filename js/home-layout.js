// What the owner can change about the home page, and the defaults.
export const HOME_SECTIONS = [
  ["categories", "Shop by category"],
  ["gang", "The AfterHours Gang (characters)"],
  ["deals", "Deals of the day"],
  ["featured", "Picked for you"],
  ["marquee", "Scrolling text"],
  ["trust", "Why shop with us"],
  ["member", "Membership banner"],
  ["collections", "Collections"],
  ["lookbook", "Lookbook photos"],
  ["pricing", "Pricing"],
  ["how", "How it works"],
];

export const DEFAULT_LOOKBOOK = Array.from({ length: 12 }, (_, i) => ({ src: `assets/lookbook/${String(i + 1).padStart(2, "0")}.webp`, caption: "", link: "" }));

const DEFAULT_HERO = { kicker: "Sarees, custom tees and more", line1: "Tradition, worn", line2: "your way.", text: "Handpicked sarees for every celebration, graphic tees printed the moment you order, and new categories every season.", product: "" };

/** Fills in anything not saved yet, so new sections appear without a data change. */
export function homeLayout(saved) {
  const value = saved || {};
  const known = new Set(HOME_SECTIONS.map(([id]) => id));
  const sections = (value.sections || []).filter((s) => known.has(s.id));
  // A section added after the owner saved a layout goes in its default place, switched on.
  HOME_SECTIONS.forEach(([id], index) => {
    if (!sections.some((s) => s.id === id)) sections.splice(Math.min(index, sections.length), 0, { id, on: true });
  });
  return {
    banner: { on: false, text: "", ...(value.banner || {}) },
    hero: { ...DEFAULT_HERO, ...(value.hero || {}) },
    banners: value.banners || [],
    lookbook: value.lookbook || [],
    lookbook_title: value.lookbook_title || "",
    featured: value.featured || [],
    featured_title: value.featured_title || "",
    marquee: value.marquee || [],
    characters: { on: true, title: "", products: [], names: {}, lines: {}, ...(value.characters || {}) },
    footer_text: value.footer_text || "",
    sections,
    collections: value.collections || [],
  };
}
