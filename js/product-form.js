// The guided form for adding and editing a product. Its details, sizes and
// pictures follow the product's category.
import { api } from "./api.js";
import { esc, money, toast, openModal, tee, sareeArt, itemArt, FREE_SIZE, fieldText } from "./ui.js";
import { attachPriceHelp } from "./analytics.js";

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const GRAPHIC_TYPES = [...PHOTO_TYPES, "image/svg+xml"];
const MAX_FILE = 15 * 1024 * 1024;
const MAX_COLORS = 12;
const MAX_COLOR_PHOTOS = 6;
const MAX_SHARED_PHOTOS = 12;
export const QUICK_COLORS = [["Black", "#000000"], ["White", "#FFFFFF"], ["Navy", "#1B2A4A"], ["Charcoal", "#36454F"], ["Maroon", "#800000"], ["Olive", "#556B2F"], ["Beige", "#D8C9A8"]];

export const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const field = (key, label, control, hint = "") => `<div class="field pf-field"><label for="pf-${key}">${label}</label>${control}${hint ? `<small class="muted">${hint}</small>` : ""}<small class="pf-err" data-err="${key}" hidden></small></div>`;

export const segments = (name, options, value, label) => `<div class="seg" role="radiogroup" aria-label="${label}">${options.map(([v, text]) => `<label><input type="radio" name="${name}" value="${v}" ${v === value ? "checked" : ""}><span>${text}</span></label>`).join("")}</div>`;

function normalizeHex(value) {
  const text = value.trim().toUpperCase();
  return text && !text.startsWith("#") ? `#${text}` : text;
}

/** Keeps only files the store can use, and explains the ones it can't. */
export function usableFiles(files, types, room) {
  const list = [];
  for (const file of files) {
    if (!types.includes(file.type)) toast(`${file.name} must be ${types.includes("image/svg+xml") ? "a PNG, JPG, WebP or SVG" : "a PNG, JPG or WebP"} image`, "bad");
    else if (file.size > MAX_FILE) toast(`${file.name} is larger than 15 MB`, "bad");
    else list.push(file);
  }
  if (list.length > room) toast(`Only ${room} more photo${room === 1 ? "" : "s"} can be added here`, "bad");
  return list.slice(0, Math.max(room, 0));
}

export const asItem = (file) => ({ src: URL.createObjectURL(file), file });

/** Turns an element into a place to click or drop files. */
export function bindDrop(zone, onFiles) {
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("over");
    onFiles([...event.dataTransfer.files]);
  });
}

/** A row of photos with add, remove and make-cover. */
function drawPhotos(area, items, limit, onChange) {
  area.innerHTML = `${items.map((item, i) => `<div class="pf-thumb">
      <button type="button" class="pf-cover" data-cover="${i}" title="${i ? "Make this the first photo" : "First photo"}" aria-label="${i ? `Make photo ${i + 1} the first photo` : "First photo"}"><img src="${esc(item.src)}" alt=""></button>
      ${i ? "" : '<em>First</em>'}
      <button type="button" class="pf-x" data-remove="${i}" aria-label="Remove photo ${i + 1}">×</button>
    </div>`).join("")}
    ${items.length < limit ? `<label class="pf-add"><input type="file" multiple accept="${PHOTO_TYPES.join(",")}" hidden><b>+</b><span>Add photos</span></label>` : ""}`;
  const add = (files) => {
    items.push(...usableFiles(files, PHOTO_TYPES, limit - items.length).map(asItem));
    onChange();
  };
  area.querySelector("input")?.addEventListener("change", (event) => add([...event.target.files]));
  area.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => {
    items.splice(Number(b.dataset.remove), 1);
    onChange();
  }));
  area.querySelectorAll("[data-cover]").forEach((b) => b.addEventListener("click", () => {
    const index = Number(b.dataset.cover);
    if (!index) return;
    items.unshift(...items.splice(index, 1));
    onChange();
  }));
  if (!area.dataset.drop) {
    area.dataset.drop = "1";
    bindDrop(area, (files) => area.dropHandler(files));
  }
  area.dropHandler = add;
}

const STEPS = [
  ["Details", "What is it, which category and collection does it belong to?"],
  ["Price", "Set what customers pay. Enter what it cost you to see your profit."],
  ["Specifications", "The details customers compare: fabric, border, fit and more, plus Size and fit and Care."],
  ["Sizes and colours", "Choose the sizes and colours you have. Each colour can have its own photos."],
  ["Photos", "Photos that apply to every colour. Printed tees also need their print files here."],
  ["Review", "Check everything, then save."],
];

const specControl = (f, value) => {
  const id = `pf-s-${f.key}`;
  if (f.type === "select") return `<select id="${id}" data-spec="${esc(f.key)}"><option value="">Not set</option>${[...new Set([...(f.options || []), ...(value && !(f.options || []).includes(value) ? [value] : [])])].map((o) => `<option ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  if (f.type === "number") return `<input id="${id}" data-spec="${esc(f.key)}" type="number" inputmode="decimal" step="any" min="0" value="${esc(value ?? "")}" placeholder="${esc(f.unit || "")}">`;
  if (f.type === "yesno") return `<select id="${id}" data-spec="${esc(f.key)}"><option value="">Not set</option><option value="yes" ${value === true ? "selected" : ""}>Yes, included</option><option value="no" ${value === false ? "selected" : ""}>No</option></select>`;
  return `<input id="${id}" data-spec="${esc(f.key)}" maxlength="80" value="${esc(value ?? "")}">`;
};

export function productForm(product, ctx, startCategory = "") {
  const categories = ctx.store.categories;
  const firstSlug = startCategory || categories[0]?.slug || "tee";
  const catBy = (slug) => categories.find((c) => c.slug === slug) || categories[0] || { slug, name: slug, art: "photo", sizes: [FREE_SIZE], fields: [], size_fit: "", care: "" };
  const lastIn = (slug) => [...ctx.store.products].reverse().find((x) => x.category === slug);
  const startCat = catBy(product?.category || firstSlug);
  const p = product || {
    category: startCat.slug, name: "", tagline: "", description: "", collection: lastIn(startCat.slug)?.collection || "", price_inr: lastIn(startCat.slug)?.price_inr || 999, compare_at_inr: null,
    sizes: [...startCat.sizes], status: "live", gender: startCat.art === "saree" ? "female" : "unisex", colors: startCat.art === "tee" ? [{ name: "Black", hex: "#000000" }] : [], details: {}, size_fit: "", care: "",
  };
  const collections = [...new Set(ctx.store.products.map((x) => x.collection))];
  const state = {
    step: 0,
    cat: catBy(p.category),
    sizes: new Set(p.sizes),
    details: { ...(p.details || {}) },
    colors: (p.colors || []).map((c) => ({ name: c.name, hex: c.hex.toUpperCase(), photos: (c.images || []).map((src) => ({ src })) })),
    shared: [...new Set([p.model_image, ...(p.gallery || [])].filter(Boolean))].map((src) => ({ src })),
    back: p.print_back ? { src: p.print_back } : null,
    front: p.print_front ? { src: p.print_front } : null,
    previewColor: 0,
    dirty: false,
    saving: false,
    tried: false,
  };
  const printed = () => state.cat.art === "tee";
  const single = () => state.cat.sizes.length <= 1 && (state.cat.sizes[0] || FREE_SIZE) === FREE_SIZE;

  const stepHtml = (index, inner) => `<section class="pf-step" data-step="${index}" ${index ? "hidden" : ""}><header><h3>${STEPS[index][0]}</h3><p class="muted small">${STEPS[index][1]}</p></header>${inner}</section>`;
  const graphic = (key, label, hint) => `<div class="field pf-field"><span class="pf-label">${label}</span>
    <label class="pf-graphic" id="pf-${key}-zone"><input type="file" id="pf-${key}" accept="${GRAPHIC_TYPES.join(",")}" hidden><span class="pf-graphic-view" id="pf-${key}-view"></span></label>
    <small class="muted">${hint}</small><small class="pf-err" data-err="${key}" hidden></small></div>`;

  openModal(`<h2>${product ? `Edit ${esc(p.name)}` : "Add a new product"}</h2>
    <ol class="pf-steps">${STEPS.map(([label], i) => `<li><button type="button" data-go="${i}"><b>${i + 1}</b><span>${label}</span></button></li>`).join("")}</ol>
    <div class="pf-layout">
      <form id="product" class="form" novalidate>
        ${stepHtml(0, `
          ${field("category", "Category", `<select id="pf-category" name="category">${categories.map((c) => `<option value="${esc(c.slug)}" ${c.slug === state.cat.slug ? "selected" : ""}>${esc(c.name)}${c.status === "hidden" ? " (hidden)" : ""}</option>`).join("")}</select>`, 'Need a new kind of product? Add it in the <a class="inline-link" href="#/categories">Categories</a> tab.')}
          ${field("name", "Product name", `<input id="pf-name" name="name" required maxlength="80" value="${esc(p.name)}" placeholder="Example: Rani Banarasi Silk">`)}
          ${field("tagline", "Short tagline", `<input id="pf-tagline" name="tagline" maxlength="120" value="${esc(p.tagline)}" placeholder="One line shown under the name">`, "Optional, up to 120 characters.")}
          ${field("description", "Product details", `<textarea id="pf-description" name="description" rows="4" maxlength="1500" placeholder="Describe the look, the weave or print, and what makes it special.">${esc(p.description)}</textarea>`, "Shown under Product details on the product page.")}
          ${field("collection", "Collection", `<input id="pf-collection" name="collection" required maxlength="40" list="pf-collections" value="${esc(p.collection)}"><datalist id="pf-collections">${collections.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>`, "Pick one or type a new name, like Wedding Edit.")}
          <div class="field pf-field"><span class="pf-label">Made for</span>${segments("gender", [["unisex", "Everyone"], ["female", "Women"], ["male", "Men"]], p.gender || "unisex", "Made for")}</div>
          <div class="field pf-field"><span class="pf-label">Visibility</span>${segments("status", [["live", "Live"], ["coming_soon", "Coming soon"], ["hidden", "Hidden"]], p.status, "Visibility")}<small class="muted" id="pf-status-hint"></small></div>`)}
        ${stepHtml(1, `
          <div class="cols">
            ${field("price", "Selling price (₹)", `<input id="pf-price" name="price_inr" type="number" inputmode="numeric" min="1" step="1" required value="${p.price_inr}">`)}
            ${field("compare", "Original price (₹)", `<input id="pf-compare" name="compare_at_inr" type="number" inputmode="numeric" min="1" step="1" value="${p.compare_at_inr ?? ""}">`, '<span id="pf-discount">Optional. Shown crossed out.</span>')}
          </div>
          ${field("cost", "Your cost for this product (₹)", '<input id="pf-cost" name="product_cost" type="number" inputmode="numeric" min="0" step="1">', "What you paid for it, or to make it. Used for profit only, never shown to customers.")}
          <div class="price-help" id="price-help"><p class="muted small">Working out a suggested price...</p></div>
          <p class="muted small">Tap Break-even, Suggested or Premium to use that price.</p>`)}
        ${stepHtml(2, `
          <div class="pf-specs" id="pf-specs"></div>
          ${field("size_fit", "Size and fit", `<textarea id="pf-size_fit" name="size_fit" rows="2" maxlength="600">${esc(p.size_fit || "")}</textarea>`, "Leave empty to use the category's text.")}
          ${field("care", "Material and care", `<textarea id="pf-care" name="care" rows="2" maxlength="400">${esc(p.care || "")}</textarea>`, "Leave empty to use the category's text.")}`)}
        ${stepHtml(3, `
          <div class="field pf-field" id="pf-size-field"><span class="pf-label">Sizes you offer</span>
            <div class="pf-sizes" id="pf-sizes"></div>
            <small class="muted">Sizes come from the category. Switch off any you don't have.</small><small class="pf-err" data-err="sizes" hidden></small></div>
          <p class="muted small" id="pf-one-size">This category is one size, so customers don't choose a size.</p>
          <div class="field pf-field"><span class="pf-label">Colours</span>
            <div class="pf-quick" id="pf-quick"></div>
            <div class="pf-colors" id="pf-colors"></div>
            <button type="button" class="btn small" id="pf-add-color">Add a custom colour</button>
            <small class="muted">Up to ${MAX_COLORS} colours, each with up to ${MAX_COLOR_PHOTOS} photos. The first colour is what customers see first.</small>
            <small class="pf-err" data-err="colors" hidden></small></div>`)}
        ${stepHtml(4, `
          <div class="cols" id="pf-graphics">
            ${graphic("back", "Back print file", "Required for printed tees. A transparent PNG works best. This file goes to your printer.")}
            ${graphic("front", "Front print file", "Optional. Usually a small chest print.")}
          </div>
          <div class="field pf-field"><span class="pf-label">Photos for every colour</span>
            <div class="pf-photos" id="pf-shared"></div>
            <small class="muted">Up to ${MAX_SHARED_PHOTOS}: full view, close-ups of the border or print, someone wearing it. Tap a photo to show it first, or drag photos here.</small><small class="pf-err" data-err="photos" hidden></small></div>`)}
        ${stepHtml(5, '<div id="pf-review"></div>')}
        <p class="error" id="product-error" hidden></p>
      </form>
      <aside class="pf-preview" aria-label="Customer preview"><span class="mono muted small">How customers see it</span><div id="pf-preview"></div></aside>
    </div>
    <footer class="pf-foot">
      <button type="button" class="btn" id="pf-back">Back</button>
      <button type="button" class="btn" id="pf-next">Next</button>
      <button type="button" class="btn primary" id="save">Save product</button>
    </footer>`, (modal, close) => {
    const form = modal.querySelector("#product");
    const $ = (selector) => modal.querySelector(selector);
    const el = form.elements;
    const readProductCost = attachPriceHelp(modal, product);
    const statusHints = { live: "Customers can see and buy it.", coming_soon: "Customers can see it but can't buy it yet.", hidden: "Only you can see it." };
    const markDirty = () => { state.dirty = true; };

    /* ---------- category-driven parts ---------- */
    const readSpecs = () => {
      const out = {};
      modal.querySelectorAll("[data-spec]").forEach((input) => {
        const f = state.cat.fields.find((x) => x.key === input.dataset.spec);
        const raw = input.value.trim();
        if (!raw) return;
        if (f.type === "number") out[f.key] = Number(raw);
        else if (f.type === "yesno") out[f.key] = raw === "yes";
        else out[f.key] = raw;
      });
      return out;
    };
    const drawSpecs = () => {
      const fields = state.cat.fields || [];
      $("#pf-specs").innerHTML = fields.length
        ? `<div class="spec-grid">${fields.map((f) => field(`s-${f.key}`, esc(f.label), specControl(f, state.details[f.key]))).join("")}</div>`
        : `<p class="muted small">${esc(state.cat.name)} has no details set up yet. Add some in the Categories tab.</p>`;
      el.size_fit.placeholder = state.cat.size_fit || "Example: Regular fit. Model is 5 ft 8 in and wears M.";
      el.care.placeholder = state.cat.care || "Example: Dry clean only.";
    };
    const drawSizes = () => {
      const choices = [...new Set([...state.cat.sizes.filter((s) => s !== FREE_SIZE), ...[...state.sizes].filter((s) => s !== FREE_SIZE)])];
      $("#pf-size-field").hidden = single();
      $("#pf-one-size").hidden = !single();
      $("#pf-sizes").innerHTML = choices.map((s) => `<button type="button" class="size ${state.sizes.has(s) ? "on" : ""}" data-size="${esc(s)}" aria-pressed="${state.sizes.has(s)}">${esc(s)}</button>`).join("");
      $("#pf-sizes").querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => {
        const size = b.dataset.size;
        if (state.sizes.has(size)) state.sizes.delete(size);
        else state.sizes.add(size);
        b.classList.toggle("on", state.sizes.has(size));
        b.setAttribute("aria-pressed", String(state.sizes.has(size)));
        markDirty();
        recheck();
      }));
    };
    const applyCategory = (fresh) => {
      Object.assign(state.details, readSpecs());
      state.cat = catBy(el.category.value);
      if (fresh) state.sizes = new Set(state.cat.sizes);
      $("#pf-graphics").hidden = !printed();
      drawSpecs();
      drawSizes();
    };

    /* ---------- checks ---------- */
    const allPhotos = () => state.shared.length + state.colors.reduce((sum, c) => sum + c.photos.length, 0);
    const problems = () => {
      const list = [];
      const add = (step, key, message) => list.push({ step, key, message });
      const price = Number(el.price_inr.value);
      const compare = el.compare_at_inr.value ? Number(el.compare_at_inr.value) : null;
      if (!el.name.value.trim()) add(0, "name", "Give this product a name.");
      if (!el.collection.value.trim()) add(0, "collection", "Choose or type a collection.");
      if (!Number.isInteger(price) || price < 1) add(1, "price", "Enter a whole number of rupees.");
      if (compare !== null && (!Number.isInteger(compare) || compare <= price)) add(1, "compare", "This should be higher than the selling price.");
      if (!single() && ![...state.sizes].some((s) => s !== FREE_SIZE)) add(3, "sizes", "Choose at least one size.");
      if (state.colors.some((c) => !c.name.trim())) add(3, "colors", "Give every colour a name.");
      else if (state.colors.some((c) => !COLOR_HEX.test(c.hex))) add(3, "colors", "Each colour needs a hex code like #1B2A4A.");
      else if (new Set(state.colors.map((c) => c.hex)).size !== state.colors.length) add(3, "colors", "Each colour needs a different hex code.");
      if (printed() && !state.back) add(4, "back", "Upload the back print file.");
      if (!printed() && !allPhotos()) add(4, "photos", "Add at least one photo, here or under a colour.");
      return list;
    };
    const showProblems = (list) => {
      modal.querySelectorAll("[data-err]").forEach((box) => { box.hidden = true; });
      list.forEach(({ key, message }) => {
        const box = modal.querySelector(`[data-err="${key}"]`);
        box.textContent = message;
        box.hidden = false;
      });
      modal.querySelectorAll("[data-go]").forEach((b) => b.classList.toggle("bad", list.some((x) => x.step === Number(b.dataset.go))));
    };
    const recheck = () => {
      if (state.tried) showProblems(state.triedSave ? problems() : problems().filter((x) => x.step <= state.step));
    };

    /* ---------- preview ---------- */
    const drawPreview = () => {
      const color = state.colors[state.previewColor] || state.colors[0];
      const photo = color?.photos[0]?.src || (printed() ? null : state.shared[0]?.src);
      const price = Number(el.price_inr.value) || 0;
      const compare = Number(el.compare_at_inr.value) || 0;
      const off = compare > price && price ? Math.round((1 - price / compare) * 100) : 0;
      const hex = COLOR_HEX.test(color?.hex || "") ? color.hex : "";
      const art = photo ? `<img class="pf-photo" src="${esc(photo)}" alt="">`
        : printed() ? tee({ print_back: state.back?.src, print_front: state.front?.src }, "back", true, hex)
          : state.cat.art === "saree" ? sareeArt(hex) : itemArt(hex);
      $("#pf-preview").innerHTML = `<div class="pf-art">${art}</div>
        <span class="card-cat">${esc(state.cat.name)}</span>
        <h4>${esc(el.name.value.trim() || "Product name")}</h4>
        <p class="muted small">${esc(el.tagline.value.trim())}</p>
        <p class="price">${money(price)}${off ? ` <s>${money(compare)}</s> <em>${off}% off</em>` : ""}</p>
        ${state.colors.length > 1 ? `<div class="pf-preview-colors">${state.colors.map((c, i) => `<button type="button" class="swatch small ${c === color ? "on" : ""}" data-preview="${i}" style="--c:${esc(COLOR_HEX.test(c.hex) ? c.hex : "#000000")}" aria-label="Preview ${esc(c.name || `colour ${i + 1}`)}"></button>`).join("")}</div>` : ""}`;
      $("#pf-preview").querySelectorAll("[data-preview]").forEach((b) => b.addEventListener("click", () => {
        state.previewColor = Number(b.dataset.preview);
        drawPreview();
      }));
      $("#pf-status-hint").textContent = statusHints[el.status.value];
      $("#pf-discount").textContent = off ? `Customers will see ${off}% off.` : "Optional. Shown crossed out.";
    };

    /* ---------- colours ---------- */
    const drawQuick = () => {
      const unused = QUICK_COLORS.filter(([, hex]) => !state.colors.some((c) => c.hex === hex));
      $("#pf-quick").innerHTML = unused.map(([name, hex]) => `<button type="button" class="pf-chip" data-name="${name}" data-hex="${hex}"><i style="--c:${hex}"></i>${name}</button>`).join("");
      $("#pf-quick").querySelectorAll("[data-hex]").forEach((b) => b.addEventListener("click", () => addColor(b.dataset.name, b.dataset.hex)));
    };
    const changed = () => {
      markDirty();
      drawPreview();
      recheck();
    };
    const drawColors = () => {
      const list = $("#pf-colors");
      list.innerHTML = state.colors.map((c, i) => `<div class="pf-color" data-index="${i}">
        <div class="pf-color-top">
          <input type="color" aria-label="Pick colour ${i + 1}" value="${COLOR_HEX.test(c.hex) ? c.hex.toLowerCase() : "#000000"}">
          <input class="pf-hex" maxlength="7" aria-label="Hex code for colour ${i + 1}" placeholder="#000000" value="${esc(c.hex)}">
          <input class="pf-name" maxlength="24" aria-label="Name of colour ${i + 1}" placeholder="Colour name" value="${esc(c.name)}">
          <button type="button" class="pf-x" data-delete aria-label="Remove ${esc(c.name || `colour ${i + 1}`)}">×</button>
        </div>
        <div class="pf-photos" data-photos></div>
      </div>`).join("") || '<p class="muted small">No colours added. Add one if customers choose between colours.</p>';
      list.querySelectorAll(".pf-color").forEach((row) => {
        const index = Number(row.dataset.index);
        const color = state.colors[index];
        const picker = row.querySelector('input[type="color"]');
        const hex = row.querySelector(".pf-hex");
        const show = () => { state.previewColor = index; changed(); };
        picker.addEventListener("input", () => {
          color.hex = picker.value.toUpperCase();
          hex.value = color.hex;
          show();
        });
        hex.addEventListener("input", () => {
          color.hex = normalizeHex(hex.value);
          if (COLOR_HEX.test(color.hex)) picker.value = color.hex.toLowerCase();
          show();
        });
        hex.addEventListener("blur", () => { hex.value = color.hex; });
        row.querySelector(".pf-name").addEventListener("input", (event) => {
          color.name = event.target.value;
          show();
        });
        row.querySelector("[data-delete]").addEventListener("click", () => {
          state.colors.splice(index, 1);
          state.previewColor = 0;
          drawColors();
          changed();
        });
        const draw = () => {
          drawPhotos(row.querySelector("[data-photos]"), color.photos, MAX_COLOR_PHOTOS, () => {
            state.previewColor = index;
            draw();
            changed();
          });
        };
        draw();
      });
      drawQuick();
      $("#pf-add-color").hidden = state.colors.length >= MAX_COLORS;
    };
    const addColor = (name, hex) => {
      if (state.colors.length >= MAX_COLORS) return toast(`You can add up to ${MAX_COLORS} colours`, "bad");
      state.colors.push({ name, hex, photos: [] });
      state.previewColor = state.colors.length - 1;
      drawColors();
      changed();
      return true;
    };
    $("#pf-add-color").addEventListener("click", () => {
      if (addColor("", "#FFFFFF")) $("#pf-colors").lastElementChild.querySelector(".pf-name").focus();
    });

    /* ---------- print files and shared photos ---------- */
    const drawGraphic = (key) => {
      const item = state[key];
      $(`#pf-${key}-view`).innerHTML = item ? `<img src="${esc(item.src)}" alt=""><small>Replace</small>` : "<b>+</b><small>Upload</small>";
    };
    ["back", "front"].forEach((key) => {
      const take = (files) => {
        const [file] = usableFiles(files, GRAPHIC_TYPES, 1);
        if (!file) return;
        state[key] = asItem(file);
        drawGraphic(key);
        changed();
      };
      $(`#pf-${key}`).addEventListener("change", (event) => take([...event.target.files]));
      bindDrop($(`#pf-${key}-zone`), take);
      drawGraphic(key);
    });
    const drawShared = () => drawPhotos($("#pf-shared"), state.shared, MAX_SHARED_PHOTOS, () => {
      drawShared();
      changed();
    });

    /* ---------- review ---------- */
    const drawReview = () => {
      const list = problems();
      const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
      const specs = readSpecs();
      const specText = state.cat.fields.map((f) => [f.label, fieldText(f, specs[f.key])]).filter(([, v]) => v).map(([l, v]) => `${l}: ${v}`).join(", ");
      const rows = [
        ["Category", state.cat.name, 0],
        ["Name", el.name.value.trim() || "Not set", 0],
        ["Collection", el.collection.value.trim() || "Not set", 0],
        ["Visibility", { live: "Live", coming_soon: "Coming soon", hidden: "Hidden" }[el.status.value], 0],
        ["Price", money(el.price_inr.value), 1],
        ["Details", specText || "None filled in", 2],
        ["Size and fit", el.size_fit.value.trim() || (state.cat.size_fit ? "Category default" : "Not set"), 2],
        ["Care", el.care.value.trim() || (state.cat.care ? "Category default" : "Not set"), 2],
        ["Sizes", single() ? "One size" : [...state.sizes].filter((s) => s !== FREE_SIZE).join(", ") || "None", 3],
        ["Colours", state.colors.map((c) => c.name.trim() || c.hex).join(", ") || "None", 3],
        ...(printed() ? [["Print files", state.front ? "Back and front" : state.back ? "Back only" : "Missing", 4]] : []),
        ["Photos", `${count(state.colors.reduce((sum, c) => sum + c.photos.length, 0), "colour photo")}, ${count(state.shared.length, "shared photo")}`, 4],
      ];
      $("#pf-review").innerHTML = `${list.length ? `<div class="pf-todo"><strong>Before you can save</strong>${list.map((x) => `<button type="button" data-fix="${x.step}">${esc(x.message)} <u>Fix</u></button>`).join("")}</div>` : '<p class="pf-ready">Everything is ready to save.</p>'}
        <dl class="pf-summary">${rows.map(([label, value, step]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd><button type="button" data-fix="${step}" aria-label="Edit ${label}">Edit</button></div>`).join("")}</dl>`;
      $("#pf-review").querySelectorAll("[data-fix]").forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.fix))));
    };

    /* ---------- moving between steps ---------- */
    const last = STEPS.length - 1;
    const go = (index) => {
      state.step = index;
      modal.querySelectorAll(".pf-step").forEach((s) => { s.hidden = Number(s.dataset.step) !== index; });
      modal.querySelectorAll("[data-go]").forEach((b) => {
        const i = Number(b.dataset.go);
        b.classList.toggle("on", i === index);
        b.classList.toggle("done", i < index);
        if (i === index) b.setAttribute("aria-current", "step");
        else b.removeAttribute("aria-current");
      });
      $("#pf-back").hidden = index === 0;
      $("#pf-next").hidden = index === last;
      $("#save").hidden = !product && index !== last;
      modal.classList.toggle("pf-reviewing", index === last);
      if (index === last) drawReview();
      modal.scrollTo({ top: 0, behavior: "instant" });
      $(".pf-steps").querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center" });
    };
    const next = () => {
      const blocking = problems().filter((x) => x.step === state.step);
      if (blocking.length) {
        state.tried = true;
        showProblems(problems().filter((x) => x.step <= state.step));
        modal.querySelector(`[data-err="${blocking[0].key}"]`).scrollIntoView({ block: "center" });
        return;
      }
      go(Math.min(state.step + 1, last));
    };
    modal.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.go))));
    $("#pf-back").addEventListener("click", () => go(Math.max(state.step - 1, 0)));
    $("#pf-next").addEventListener("click", next);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      next();
    });
    form.addEventListener("input", changed);
    form.addEventListener("change", (event) => {
      if (event.target.name === "category") applyCategory(true);
      changed();
    });
    modal.querySelector('a[href="#/categories"]')?.addEventListener("click", (event) => {
      if (state.dirty && !confirm("Leave this product without saving?")) event.preventDefault();
      else { state.dirty = false; close(); }
    });

    /* ---------- saving ---------- */
    const save = async () => {
      const list = problems();
      state.tried = true;
      state.triedSave = true;
      showProblems(list);
      const errorBox = $("#product-error");
      errorBox.hidden = true;
      if (list.length) return go(list[0].step);
      const button = $("#save");
      const items = [...(printed() ? [state.back, state.front] : []), ...state.colors.flatMap((c) => c.photos), ...state.shared].filter((item) => item?.file);
      let sent = 0;
      state.saving = true;
      button.disabled = true;
      button.textContent = "Saving";
      try {
        const slug = p.slug || `${slugify(el.name.value) || "product"}-${Date.now().toString(36)}`;
        for (const item of items) {
          button.textContent = `Uploading ${++sent} of ${items.length}`;
          item.src = await api.upload(item.file, slug);
          item.file = null;
        }
        button.textContent = "Saving";
        const values = {
          name: el.name.value.trim(),
          tagline: el.tagline.value.trim(),
          description: el.description.value.trim(),
          collection: el.collection.value.trim(),
          price_inr: Number(el.price_inr.value),
          compare_at_inr: el.compare_at_inr.value ? Number(el.compare_at_inr.value) : null,
          status: el.status.value,
          category: state.cat.slug,
          gender: el.gender.value,
          sizes: single() ? [FREE_SIZE] : [...new Set([...state.cat.sizes, ...state.sizes])].filter((s) => s !== FREE_SIZE && state.sizes.has(s)),
          details: readSpecs(),
          size_fit: el.size_fit.value.trim(),
          care: el.care.value.trim(),
          slug,
          colors: state.colors.map((c) => ({ name: c.name.trim(), hex: c.hex, images: c.photos.map((photo) => photo.src) })),
          gallery: state.shared.map((photo) => photo.src),
          model_image: null,
          print_back: printed() ? state.back.src : null,
          print_file_back: printed() ? state.back.src : null,
          print_front: printed() && state.front ? state.front.src : null,
          print_file_front: printed() && state.front ? state.front.src : null,
        };
        if (product) values.id = product.id;
        else values.sort = Math.max(0, ...ctx.store.products.map((x) => x.sort)) + 10;
        const savedId = await api.saveProduct(values);
        const productCost = (await readProductCost)();
        if (productCost !== undefined) await api.saveProductCost(savedId, productCost);
        state.dirty = false;
        close();
        toast(product ? "Product saved" : "Product added");
        await ctx.refresh();
        await ctx.redraw();
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
        button.disabled = false;
        button.textContent = "Save product";
        state.saving = false;
      }
    };
    $("#save").addEventListener("click", save);

    drawColors();
    drawShared();
    applyCategory(false);
    drawPreview();
    go(0);
    state.dirty = false;
  }, null, {
    className: "pf-modal",
    canClose: () => !state.saving && (!state.dirty || confirm("Discard your changes to this product?")),
  });
}
