// The guided, five-step form for adding and editing a product.
import { api } from "./api.js";
import { esc, money, toast, openModal, tee } from "./ui.js";
import { attachPriceHelp } from "./analytics.js";

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const GRAPHIC_TYPES = [...PHOTO_TYPES, "image/svg+xml"];
const MAX_FILE = 15 * 1024 * 1024;
const MAX_COLORS = 12;
const MAX_COLOR_PHOTOS = 6;
const MAX_SHARED_PHOTOS = 12;
const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const QUICK_COLORS = [["Black", "#000000"], ["White", "#FFFFFF"], ["Navy", "#1B2A4A"], ["Charcoal", "#36454F"], ["Maroon", "#800000"], ["Olive", "#556B2F"], ["Beige", "#D8C9A8"]];
const STEPS = [
  ["Details", "What is this tee, and who is it for?"],
  ["Price", "Set what customers pay. We suggest a price from your costs."],
  ["Sizes and colours", "Choose the sizes and tee colours you can print on. Each colour can have its own photos."],
  ["Graphics and photos", "Add the print files for your printer, and photos that apply to every colour."],
  ["Review", "Check everything, then save."],
];

const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const field = (key, label, control, hint = "") => `<div class="field pf-field"><label for="pf-${key}">${label}</label>${control}${hint ? `<small class="muted">${hint}</small>` : ""}<small class="pf-err" data-err="${key}" hidden></small></div>`;

const segments = (name, options, value, label) => `<div class="seg" role="radiogroup" aria-label="${label}">${options.map(([v, text]) => `<label><input type="radio" name="${name}" value="${v}" ${v === value ? "checked" : ""}><span>${text}</span></label>`).join("")}</div>`;

function normalizeHex(value) {
  const text = value.trim().toUpperCase();
  return text && !text.startsWith("#") ? `#${text}` : text;
}

/** Keeps only files the store can use, and explains the ones it can't. */
function usableFiles(files, types, room) {
  const list = [];
  for (const file of files) {
    if (!types.includes(file.type)) toast(`${file.name} must be ${types.includes("image/svg+xml") ? "a PNG, JPG, WebP or SVG" : "a PNG, JPG or WebP"} image`, "bad");
    else if (file.size > MAX_FILE) toast(`${file.name} is larger than 15 MB`, "bad");
    else list.push(file);
  }
  if (list.length > room) toast(`Only ${room} more photo${room === 1 ? "" : "s"} can be added here`, "bad");
  return list.slice(0, Math.max(room, 0));
}

const asItem = (file) => ({ src: URL.createObjectURL(file), file });

/** Turns an element into a place to click or drop files. */
function bindDrop(zone, onFiles) {
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

export function productForm(product, ctx) {
  const p = product || { name: "", tagline: "", description: "", collection: "Drop 01", price_inr: 899, compare_at_inr: null, sizes: ["S", "M", "L", "XL", "XXL"], status: "live", gender: "unisex", colors: [{ name: "Black", hex: "#000000" }] };
  const collections = [...new Set(ctx.store.products.map((x) => x.collection))];
  const sizeChoices = [...new Set([...SIZE_OPTIONS, ...p.sizes])];
  const state = {
    step: 0,
    sizes: new Set(p.sizes),
    colors: (p.colors || []).map((c) => ({ name: c.name, hex: c.hex.toUpperCase(), photos: (c.images || []).map((src) => ({ src })) })),
    shared: [...new Set([p.model_image, ...(p.gallery || [])].filter(Boolean))].map((src) => ({ src })),
    back: p.print_back ? { src: p.print_back } : null,
    front: p.print_front ? { src: p.print_front } : null,
    previewColor: 0,
    dirty: false,
    saving: false,
    tried: false,
  };

  const stepHtml = (index, inner) => `<section class="pf-step" data-step="${index}" ${index ? "hidden" : ""}><header><h3>${STEPS[index][0]}</h3><p class="muted small">${STEPS[index][1]}</p></header>${inner}</section>`;
  const graphic = (key, label, hint) => `<div class="field pf-field"><span class="pf-label">${label}</span>
    <label class="pf-graphic" id="pf-${key}-zone"><input type="file" id="pf-${key}" accept="${GRAPHIC_TYPES.join(",")}" hidden><span class="pf-graphic-view" id="pf-${key}-view"></span></label>
    <small class="muted">${hint}</small><small class="pf-err" data-err="${key}" hidden></small></div>`;

  openModal(`<h2>${product ? `Edit ${esc(p.name)}` : "Add a new product"}</h2>
    <ol class="pf-steps">${STEPS.map(([label], i) => `<li><button type="button" data-go="${i}"><b>${i + 1}</b><span>${label}</span></button></li>`).join("")}</ol>
    <div class="pf-layout">
      <form id="product" class="form" novalidate>
        ${stepHtml(0, `
          ${field("name", "Product name", `<input id="pf-name" name="name" required maxlength="80" value="${esc(p.name)}" placeholder="Example: Midnight Rider">`)}
          ${field("tagline", "Short tagline", `<input id="pf-tagline" name="tagline" maxlength="120" value="${esc(p.tagline)}" placeholder="One line shown under the name">`, "Optional, up to 120 characters.")}
          ${field("description", "Description", `<textarea id="pf-description" name="description" rows="3" maxlength="600" placeholder="What's the idea behind this design?">${esc(p.description)}</textarea>`, "Optional, shown on the product page.")}
          ${field("collection", "Collection", `<input id="pf-collection" name="collection" required maxlength="40" list="pf-collections" value="${esc(p.collection)}"><datalist id="pf-collections">${collections.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>`, "Pick one or type a new name. Collections appear in the side menu.")}
          <div class="field pf-field"><span class="pf-label">Made for</span>${segments("gender", [["unisex", "Both"], ["male", "Male"], ["female", "Female"]], p.gender || "unisex", "Made for")}<small class="muted">"Both" appears under the Male and Female filters.</small></div>
          <div class="field pf-field"><span class="pf-label">Visibility</span>${segments("status", [["live", "Live"], ["coming_soon", "Coming soon"], ["hidden", "Hidden"]], p.status, "Visibility")}<small class="muted" id="pf-status-hint"></small></div>`)}
        ${stepHtml(1, `
          <div class="cols">
            ${field("price", "Selling price (₹)", `<input id="pf-price" name="price_inr" type="number" inputmode="numeric" min="1" step="1" required value="${p.price_inr}">`)}
            ${field("compare", "Original price (₹)", `<input id="pf-compare" name="compare_at_inr" type="number" inputmode="numeric" min="1" step="1" value="${p.compare_at_inr ?? ""}">`, '<span id="pf-discount">Optional. Shown crossed out.</span>')}
          </div>
          ${field("cost", "This tee's cost (₹)", '<input id="pf-cost" name="product_cost" type="number" inputmode="numeric" min="0" step="1">', "Optional. Leave blank to use the costs in your Margin tab.")}
          <div class="price-help" id="price-help"><p class="muted small">Working out a suggested price...</p></div>
          <p class="muted small">Tap Break-even, Suggested or Premium to use that price.</p>`)}
        ${stepHtml(2, `
          <div class="field pf-field"><span class="pf-label">Sizes you offer</span>
            <div class="pf-sizes">${sizeChoices.map((s) => `<button type="button" class="size ${state.sizes.has(s) ? "on" : ""}" data-size="${esc(s)}" aria-pressed="${state.sizes.has(s)}">${esc(s)}</button>`).join("")}</div>
            <small class="muted">Measurements in the size guide come from Store info.</small><small class="pf-err" data-err="sizes" hidden></small></div>
          <div class="field pf-field"><span class="pf-label">Tee colours</span>
            <div class="pf-quick" id="pf-quick"></div>
            <div class="pf-colors" id="pf-colors"></div>
            <button type="button" class="btn small" id="pf-add-color">Add a custom colour</button>
            <small class="muted">Use the exact hex code of your blank tee. Up to ${MAX_COLORS} colours, each with up to ${MAX_COLOR_PHOTOS} photos. The first colour is what customers see first.</small>
            <small class="pf-err" data-err="colors" hidden></small></div>`)}
        ${stepHtml(3, `
          <div class="cols">
            ${graphic("back", "Back graphic", "Required. A transparent PNG works best. This file goes to your printer.")}
            ${graphic("front", "Front graphic", "Optional. Usually a small chest print.")}
          </div>
          <div class="field pf-field"><span class="pf-label">Photos for every colour</span>
            <div class="pf-photos" id="pf-shared"></div>
            <small class="muted">Up to ${MAX_SHARED_PHOTOS}, like lifestyle shots or close-ups of the print. Tap a photo to show it first, or drag photos here.</small></div>`)}
        ${stepHtml(4, '<div id="pf-review"></div>')}
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

    /* ---------- checks ---------- */
    const problems = () => {
      const list = [];
      const add = (step, key, message) => list.push({ step, key, message });
      const price = Number(el.price_inr.value);
      const compare = el.compare_at_inr.value ? Number(el.compare_at_inr.value) : null;
      if (!el.name.value.trim()) add(0, "name", "Give this product a name.");
      if (!el.collection.value.trim()) add(0, "collection", "Choose or type a collection.");
      if (!Number.isInteger(price) || price < 1) add(1, "price", "Enter a whole number of rupees.");
      if (compare !== null && (!Number.isInteger(compare) || compare <= price)) add(1, "compare", "This should be higher than the selling price.");
      if (!state.sizes.size) add(2, "sizes", "Choose at least one size.");
      if (state.colors.some((c) => !c.name.trim())) add(2, "colors", "Give every colour a name.");
      else if (state.colors.some((c) => !COLOR_HEX.test(c.hex))) add(2, "colors", "Each colour needs a hex code like #1B2A4A.");
      else if (new Set(state.colors.map((c) => c.hex)).size !== state.colors.length) add(2, "colors", "Each colour needs a different hex code.");
      if (!state.back) add(3, "back", "Upload the back graphic.");
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
      const photo = color?.photos[0]?.src;
      const price = Number(el.price_inr.value) || 0;
      const compare = Number(el.compare_at_inr.value) || 0;
      const off = compare > price && price ? Math.round((1 - price / compare) * 100) : 0;
      const art = photo ? `<img class="pf-photo" src="${esc(photo)}" alt="">` : tee({ print_back: state.back?.src, print_front: state.front?.src }, "back", true, COLOR_HEX.test(color?.hex || "") ? color.hex : "");
      $("#pf-preview").innerHTML = `<div class="pf-art">${art}</div>
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
      </div>`).join("") || '<p class="muted small">No colours added. This tee will sell as black.</p>';
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

    /* ---------- sizes, graphics and shared photos ---------- */
    modal.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => {
      const size = b.dataset.size;
      if (state.sizes.has(size)) state.sizes.delete(size);
      else state.sizes.add(size);
      b.classList.toggle("on", state.sizes.has(size));
      b.setAttribute("aria-pressed", String(state.sizes.has(size)));
      markDirty();
      recheck();
    }));
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
      const noPhotos = state.colors.filter((c) => !c.photos.length).map((c) => c.name.trim()).filter(Boolean);
      const rows = [
        ["Name", el.name.value.trim() || "Not set", 0],
        ["Collection", el.collection.value.trim() || "Not set", 0],
        ["Made for", { unisex: "Both", male: "Male", female: "Female" }[el.gender.value], 0],
        ["Visibility", { live: "Live", coming_soon: "Coming soon", hidden: "Hidden" }[el.status.value], 0],
        ["Price", money(el.price_inr.value), 1],
        ["Sizes", [...state.sizes].join(", ") || "None", 2],
        ["Colours", state.colors.map((c) => c.name.trim() || c.hex).join(", ") || "Black only", 2],
        ["Graphics", state.front ? "Back and front" : state.back ? "Back only" : "Missing", 3],
        ["Photos", `${count(state.colors.reduce((sum, c) => sum + c.photos.length, 0), "colour photo")}, ${count(state.shared.length, "shared photo")}`, state.colors.length ? 2 : 3],
      ];
      $("#pf-review").innerHTML = `${list.length ? `<div class="pf-todo"><strong>Before you can save</strong>${list.map((x) => `<button type="button" data-fix="${x.step}">${esc(x.message)} <u>Fix</u></button>`).join("")}</div>` : '<p class="pf-ready">Everything is ready to save.</p>'}
        <dl class="pf-summary">${rows.map(([label, value, step]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd><button type="button" data-fix="${step}" aria-label="Edit ${label}">Edit</button></div>`).join("")}</dl>
        ${noPhotos.length && state.colors.length > 1 ? `<p class="muted small">Tip: ${esc(noPhotos.join(", "))} ${noPhotos.length === 1 ? "has" : "have"} no photos yet. Customers will see the tee drawing in that colour.</p>` : ""}`;
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
    form.addEventListener("change", (event) => { if (event.target.type === "radio") changed(); });

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
      const items = [state.back, state.front, ...state.colors.flatMap((c) => c.photos), ...state.shared].filter((item) => item?.file);
      let sent = 0;
      state.saving = true;
      button.disabled = true;
      button.textContent = "Saving";
      try {
        const slug = p.slug || `${slugify(el.name.value)}-${Date.now().toString(36)}`;
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
          gender: el.gender.value,
          sizes: sizeChoices.filter((s) => state.sizes.has(s)),
          slug,
          colors: state.colors.map((c) => ({ name: c.name.trim(), hex: c.hex, images: c.photos.map((photo) => photo.src) })),
          gallery: state.shared.map((photo) => photo.src),
          model_image: null,
          print_back: state.back.src,
          print_file_back: state.back.src,
        };
        if (state.front) {
          values.print_front = state.front.src;
          values.print_file_front = state.front.src;
        }
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
    drawPreview();
    go(0);
    state.dirty = false;
  }, null, {
    className: "pf-modal",
    canClose: () => !state.saving && (!state.dirty || confirm("Discard your changes to this product?")),
  });
}
