// What the owner can change about the home page, and the defaults.
export const HOME_SECTIONS = [
  ["categories", "Shop by category"],
  ["marquee", "Scrolling text"],
  ["trust", "Why shop with us"],
  ["member", "Membership banner"],
  ["collections", "Collections"],
  ["lookbook", "Lookbook photos"],
  ["pricing", "Pricing"],
  ["how", "How it works"],
];

const DEFAULT_HERO = { kicker: "Sarees and custom tees", line1: "Tradition, worn", line2: "your way.", text: "Handpicked traditional and casual sarees for every celebration, and graphic tees printed the moment you order.", product: "" };

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
    sections,
    collections: value.collections || [],
  };
}
