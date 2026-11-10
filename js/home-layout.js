// What the owner can change about the home page, and the defaults.
export const HOME_SECTIONS = [
  ["marquee", "Scrolling text"],
  ["trust", "Why shop with us"],
  ["member", "Membership banner"],
  ["collections", "Collections"],
  ["lookbook", "Lookbook photos"],
  ["pricing", "Pricing"],
  ["how", "How it works"],
];

const DEFAULT_HERO = { kicker: "Streetwear for the late shift", line1: "Made for", line2: "after dark.", text: "Graphic tees printed the moment you order. No warehouse, no leftovers.", product: "" };

/** Fills in anything not saved yet, so new sections appear without a data change. */
export function homeLayout(saved) {
  const value = saved || {};
  const known = new Set(HOME_SECTIONS.map(([id]) => id));
  const stored = (value.sections || []).filter((s) => known.has(s.id));
  const missing = HOME_SECTIONS.filter(([id]) => !stored.some((s) => s.id === id)).map(([id]) => ({ id, on: true }));
  return {
    banner: { on: false, text: "", ...(value.banner || {}) },
    hero: { ...DEFAULT_HERO, ...(value.hero || {}) },
    sections: [...stored, ...missing],
    collections: value.collections || [],
  };
}
