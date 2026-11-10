// Products tab: drop designs to publish them, and a spreadsheet-style list for names and prices.
import { api } from "./api.js";
import { esc, money, toast, openModal, tee } from "./ui.js";
import { withDefaults, unitEconomics, suggestPrices } from "./margin.js";
import { productForm, usableFiles, asItem, bindDrop, segments, slugify, GRAPHIC_TYPES, QUICK_COLORS } from "./product-form.js";

const MAX_DRAFTS = 30;
const DEFAULT_SIZES = ["S", "M", "L", "XL", "XXL"];
const STATUSES = [["live", "Live"], ["coming_soon", "Coming soon"], ["hidden", "Hidden"]];

/** "mahakumbh_drop-2 final.png" becomes "Mahakumbh Drop 2". */
const nameFromFile = (file) => file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b(final|copy|new|v\d+)\b/gi, " ").replace(/\(\d+\)/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);

/** Rounds a price to end in 9, like 989 or 1049. */
const friendlyPrice = (value) => Math.max(Math.round(value / 10) * 10 - 1, 1);

function drawQuickPublish(area, ctx, economics) {
  const products = ctx.store.products;
  const newest = products[products.length - 1];
  const suggested = economics ? suggestPrices(economics.costs, economics.shop).suggested?.price : null;
  const state = { drafts: [], price: newest?.price_inr || suggested || 899, collection: newest?.collection || "", gender: "unisex", colors: new Set(["#000000"]), busy: false };

  const addFiles = (files) => {
    state.drafts.push(...usableFiles(files, GRAPHIC_TYPES, MAX_DRAFTS - state.drafts.length).map((file) => ({ ...asItem(file), name: nameFromFile(file) })));
    draw();
  };
  const firstHex = () => QUICK_COLORS.find(([, hex]) => state.colors.has(hex))?.[1] || "";

  const publish = async (button) => {
    const fail = (message) => toast(message, "bad");
    const price = Number(state.price);
    if (state.drafts.some((d) => !d.name.trim())) return fail("Give every tee a name.");
    if (!Number.isInteger(price) || price < 1) return fail("Enter a price in whole rupees.");
    if (!state.collection.trim()) return fail("Choose or type a collection.");
    state.busy = true;
    button.disabled = true;
    const total = state.drafts.length;
    const stamp = Date.now().toString(36);
    let sort = Math.max(0, ...products.map((p) => p.sort));
    let done = 0;
    try {
      for (const draft of [...state.drafts]) {
        button.textContent = `Publishing ${done + 1} of ${total}`;
        const slug = `${slugify(draft.name)}-${stamp}${done}`;
        if (draft.file) {
          draft.src = await api.upload(draft.file, slug);
          draft.file = null;
        }
        sort += 10;
        await api.saveProduct({
          name: draft.name.trim(), tagline: "", description: "", slug, sort, status: "live", price_inr: price, compare_at_inr: null,
          collection: state.collection.trim(), gender: state.gender, sizes: DEFAULT_SIZES, gallery: [], model_image: null,
          print_back: draft.src, print_file_back: draft.src,
          colors: QUICK_COLORS.filter(([, hex]) => state.colors.has(hex)).map(([name, hex]) => ({ name, hex, images: [] })),
        });
        state.drafts.shift();
        done += 1;
      }
      toast(`${total} tee${total === 1 ? "" : "s"} published`);
      await ctx.refresh();
      await ctx.redraw();
    } catch (error) {
      state.busy = false;
      toast(`${done} published. ${error.message}`, "bad");
      await ctx.refresh();
      draw();
    }
  };

  const draw = () => {
    if (!state.drafts.length) {
      area.innerHTML = `<label class="qp-drop" id="qp-drop"><input type="file" multiple accept="${GRAPHIC_TYPES.join(",")}" hidden>
        <b>+</b><span><strong>Drop your designs here to publish</strong><small class="muted">Each image becomes a tee. You can select many at once.</small></span></label>`;
      area.querySelector("input").addEventListener("change", (event) => addFiles([...event.target.files]));
      bindDrop(area.querySelector("#qp-drop"), addFiles);
      return;
    }
    const hex = firstHex();
    area.innerHTML = `<section class="panel qp">
      <div class="qp-cards">${state.drafts.map((d, i) => `<div class="qp-card">
        ${tee({ print_back: d.src }, "back", true, hex)}
        <input data-name="${i}" maxlength="80" aria-label="Name of tee ${i + 1}" value="${esc(d.name)}">
        <button type="button" class="pf-x" data-drop="${i}" aria-label="Remove ${esc(d.name)}">×</button>
      </div>`).join("")}
      ${state.drafts.length < MAX_DRAFTS ? `<label class="qp-more"><input type="file" multiple accept="${GRAPHIC_TYPES.join(",")}" hidden><b>+</b><small>Add more</small></label>` : ""}</div>
      <div class="qp-options">
        <div class="field"><label for="qp-price">Price for all (₹)</label><input id="qp-price" type="number" inputmode="numeric" min="1" step="1" value="${esc(state.price)}">${suggested ? `<button type="button" class="linkish" id="qp-suggest">Use suggested ${money(suggested)}</button>` : ""}</div>
        <div class="field"><label for="qp-collection">Collection</label><input id="qp-collection" maxlength="40" list="qp-collections" value="${esc(state.collection)}"><datalist id="qp-collections">${[...new Set(products.map((p) => p.collection))].map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist></div>
        <div class="field"><span class="pf-label">Made for</span>${segments("qp-gender", [["unisex", "Both"], ["male", "Male"], ["female", "Female"]], state.gender, "Made for")}</div>
        <div class="field"><span class="pf-label">Tee colours</span><div class="pf-quick">${QUICK_COLORS.map(([name, c]) => `<button type="button" class="pf-chip ${state.colors.has(c) ? "on" : ""}" data-color="${c}" aria-pressed="${state.colors.has(c)}"><i style="--c:${c}"></i>${name}</button>`).join("")}</div></div>
      </div>
      <div class="row qp-actions"><button type="button" class="btn" id="qp-clear">Clear</button><button type="button" class="btn primary" id="qp-publish">Publish ${state.drafts.length} tee${state.drafts.length === 1 ? "" : "s"}</button></div>
    </section>`;
    area.querySelectorAll("[data-name]").forEach((input) => input.addEventListener("input", () => { state.drafts[Number(input.dataset.name)].name = input.value; }));
    area.querySelectorAll("[data-drop]").forEach((b) => b.addEventListener("click", () => {
      state.drafts.splice(Number(b.dataset.drop), 1);
      draw();
    }));
    area.querySelector(".qp-more input")?.addEventListener("change", (event) => addFiles([...event.target.files]));
    bindDrop(area.querySelector(".qp"), addFiles);
    area.querySelector("#qp-price").addEventListener("input", (event) => { state.price = event.target.value; });
    area.querySelector("#qp-suggest")?.addEventListener("click", () => {
      state.price = suggested;
      area.querySelector("#qp-price").value = suggested;
    });
    area.querySelector("#qp-collection").addEventListener("input", (event) => { state.collection = event.target.value; });
    area.querySelectorAll('input[name="qp-gender"]').forEach((input) => input.addEventListener("change", () => { state.gender = input.value; }));
    area.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => {
      const c = b.dataset.color;
      if (state.colors.has(c)) state.colors.delete(c);
      else state.colors.add(c);
      draw();
    }));
    area.querySelector("#qp-clear").addEventListener("click", () => {
      state.drafts = [];
      draw();
    });
    area.querySelector("#qp-publish").addEventListener("click", (event) => publish(event.currentTarget));
  };
  draw();
}

export async function drawProducts(body, ctx) {
  const isOwner = ctx.store.profile.access.owner;
  const [record, overrides] = await Promise.all([api.costs().catch(() => null), api.productCosts().catch(() => new Map())]);
  const economics = record ? { costs: withDefaults(record.costs), shop: ctx.store.settings } : null;
  const products = ctx.store.products;
  const selected = new Set();
  let search = "";

  body.innerHTML = `<div id="qp-area"></div>
    <div class="row-between toolbar pm-tools">
      <input id="pm-search" type="search" placeholder="Search ${products.length} products" aria-label="Search products">
      <button class="btn small" id="new">Add with full details</button>
    </div>
    <div id="pm-list"></div>
    <div class="pm-bulk" id="pm-bulk" hidden></div>`;
  drawQuickPublish(body.querySelector("#qp-area"), ctx, economics);

  const profitText = (product, price) => {
    if (!economics || !(price > 0)) return "";
    const override = overrides.has(product.id) ? overrides.get(product.id) : undefined;
    const result = unitEconomics(price, economics.costs, economics.shop, override);
    return `<span class="${result.marginPct < economics.costs.targetPct ? "price-low" : "muted"}">${money(Math.round(result.profit))} profit</span>`;
  };
  const save = async (product, patch, message) => {
    try {
      await api.saveProduct({ id: product.id, ...patch });
      Object.assign(product, patch);
      if (message) toast(message);
      return true;
    } catch (error) {
      toast(error.message, "bad");
      return false;
    }
  };

  const drawBulk = () => {
    const bar = body.querySelector("#pm-bulk");
    bar.hidden = !selected.size;
    if (!selected.size) return;
    bar.innerHTML = `<strong>${selected.size} selected</strong>
      <button class="btn small" data-bulk="price">Change price</button>
      <button class="btn small" data-bulk="move">Move</button>
      <button class="btn small" data-bulk="status">Visibility</button>
      <button class="link" data-bulk="clear">Clear</button>`;
    bar.querySelectorAll("[data-bulk]").forEach((b) => b.addEventListener("click", () => bulk(b.dataset.bulk)));
  };

  const applyToSelected = async (build, message) => {
    const targets = products.filter((p) => selected.has(p.id));
    const results = await Promise.all(targets.map((p) => save(p, build(p))));
    const saved = results.filter(Boolean).length;
    if (saved) toast(`${saved} ${message}`);
    selected.clear();
    drawList();
    drawBulk();
  };

  const bulk = (action) => {
    if (action === "clear") {
      selected.clear();
      drawList();
      return drawBulk();
    }
    const targets = products.filter((p) => selected.has(p.id));
    if (action === "price") {
      openModal(`<h2>Change ${targets.length} price${targets.length === 1 ? "" : "s"}</h2>
        ${segments("pm-mode", [["set", "Set to"], ["up", "Raise by"], ["down", "Lower by"]], "set", "How to change the price")}
        <label class="field"><span id="pm-value-label">New price (₹)</span><input id="pm-value" type="number" inputmode="numeric" min="1" step="1"></label>
        <div class="pm-preview" id="pm-preview"></div>
        <button class="btn primary wide" id="pm-apply" disabled>Update prices</button>`, (modal, close) => {
        const value = modal.querySelector("#pm-value");
        const mode = () => modal.querySelector('input[name="pm-mode"]:checked').value;
        const priceOf = (p) => {
          const n = Number(value.value);
          if (mode() === "set") return Math.round(n);
          return friendlyPrice(p.price_inr * (1 + ((mode() === "up" ? 1 : -1) * n) / 100));
        };
        const update = () => {
          modal.querySelector("#pm-value-label").textContent = mode() === "set" ? "New price (₹)" : "Percentage (rounded to end in 9)";
          const ok = Number(value.value) > 0 && targets.every((p) => priceOf(p) >= 1);
          modal.querySelector("#pm-apply").disabled = !ok;
          modal.querySelector("#pm-preview").innerHTML = ok ? targets.slice(0, 5).map((p) => `<p class="row-between small"><span>${esc(p.name)}</span><span>${money(p.price_inr)} → <strong>${money(priceOf(p))}</strong></span></p>`).join("") + (targets.length > 5 ? `<p class="muted small">and ${targets.length - 5} more</p>` : "") : "";
        };
        modal.addEventListener("input", update);
        modal.addEventListener("change", update);
        update();
        value.focus();
        modal.querySelector("#pm-apply").addEventListener("click", async () => {
          const next = new Map(targets.map((p) => [p.id, priceOf(p)]));
          close();
          await applyToSelected((p) => ({ price_inr: next.get(p.id) }), "prices updated");
        });
      });
    } else if (action === "move") {
      openModal(`<h2>Move ${targets.length} to a collection</h2>
        <label class="field"><span>Collection</span><input id="pm-move" maxlength="40" list="pm-collections"><datalist id="pm-collections">${[...new Set(products.map((p) => p.collection))].map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist></label>
        <button class="btn primary wide" id="pm-apply">Move</button>`, (modal, close) => {
        modal.querySelector("#pm-apply").addEventListener("click", async () => {
          const collection = modal.querySelector("#pm-move").value.trim();
          if (!collection) return toast("Choose or type a collection", "bad");
          close();
          await applyToSelected(() => ({ collection }), "products moved");
        });
      });
    } else {
      openModal(`<h2>Visibility of ${targets.length}</h2><div class="stack">${STATUSES.map(([v, l]) => `<button class="btn wide" data-set="${v}">${l}</button>`).join("")}</div>`, (modal, close) => {
        modal.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", async () => {
          close();
          await applyToSelected(() => ({ status: b.dataset.set }), "products updated");
        }));
      });
    }
  };

  const drawList = () => {
    const needle = search.trim().toLowerCase();
    const shown = [...products].reverse().filter((p) => !needle || `${p.name} ${p.collection}`.toLowerCase().includes(needle));
    const list = body.querySelector("#pm-list");
    list.innerHTML = shown.length ? `<div class="pm-head"><label class="pm-check"><input type="checkbox" id="pm-all" aria-label="Select all shown" ${shown.every((p) => selected.has(p.id)) ? "checked" : ""}></label><span>Product</span><span>Price</span><span>Was</span><span>Visibility</span><span></span></div>
      ${shown.map((p) => `<div class="pm-row" data-id="${esc(p.id)}">
        <label class="pm-check"><input type="checkbox" data-pick aria-label="Select ${esc(p.name)}" ${selected.has(p.id) ? "checked" : ""}></label>
        <div class="pm-main"><div class="thumb">${p.colors?.[0]?.images?.[0] ? `<img src="${esc(p.colors[0].images[0])}" alt="">` : tee(p, "back", false, p.colors?.[0]?.hex)}</div>
          <div class="pm-text"><input class="pm-name" maxlength="80" aria-label="Name" value="${esc(p.name)}"><input class="pm-collection" maxlength="40" aria-label="Collection of ${esc(p.name)}" value="${esc(p.collection)}"></div></div>
        <div class="pm-price"><label class="inline">₹<input class="price-input" type="number" inputmode="numeric" min="1" step="1" aria-label="Price of ${esc(p.name)}" value="${p.price_inr}"></label><small data-profit>${profitText(p, p.price_inr)}</small></div>
        <label class="inline pm-was">₹<input class="was-input" type="number" inputmode="numeric" min="1" step="1" aria-label="Original price of ${esc(p.name)}" placeholder="None" value="${p.compare_at_inr ?? ""}"></label>
        <select class="status-input" aria-label="Visibility of ${esc(p.name)}">${STATUSES.map(([v, l]) => `<option value="${v}" ${p.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <div class="row-actions"><button class="btn small edit">Edit</button>${isOwner ? '<button class="btn small danger delete">Delete</button>' : ""}</div>
      </div>`).join("")}` : '<p class="muted">No products match.</p>';

    list.querySelector("#pm-all")?.addEventListener("change", (event) => {
      shown.forEach((p) => (event.target.checked ? selected.add(p.id) : selected.delete(p.id)));
      drawList();
      drawBulk();
    });
    list.querySelectorAll(".pm-row").forEach((row) => {
      const product = products.find((p) => p.id === row.dataset.id);
      const q = (s) => row.querySelector(s);
      q("[data-pick]").addEventListener("change", (event) => {
        if (event.target.checked) selected.add(product.id);
        else selected.delete(product.id);
        drawBulk();
      });
      q(".edit").addEventListener("click", () => productForm(product, ctx));
      q(".delete")?.addEventListener("click", async () => {
        if (!confirm(`Delete ${product.name} permanently? It will disappear from the shop. Past orders keep their details. This cannot be undone.`)) return;
        try {
          await api.deleteProduct(product.id);
          toast(`${product.name} deleted`);
          await ctx.refresh();
          await ctx.redraw();
        } catch (error) {
          toast(error.message, "bad");
        }
      });
      const text = (selector, key, label) => q(selector).addEventListener("change", async (event) => {
        const value = event.target.value.trim();
        if (!value) {
          event.target.value = product[key];
          return toast(`${label} can't be empty`, "bad");
        }
        if (await save(product, { [key]: value }, `${label} saved`)) return;
        event.target.value = product[key];
      });
      text(".pm-name", "name", "Name");
      text(".pm-collection", "collection", "Collection");
      const price = q(".price-input");
      price.addEventListener("input", () => { q("[data-profit]").innerHTML = profitText(product, Number(price.value)); });
      price.addEventListener("change", async () => {
        const value = Number(price.value);
        if (!Number.isInteger(value) || value < 1) {
          price.value = product.price_inr;
          q("[data-profit]").innerHTML = profitText(product, product.price_inr);
          return toast("Price must be a whole number of rupees", "bad");
        }
        if (!(await save(product, { price_inr: value }, `${product.name} is now ${money(value)}`))) price.value = product.price_inr;
      });
      q(".was-input").addEventListener("change", async (event) => {
        const value = event.target.value ? Number(event.target.value) : null;
        if (value !== null && (!Number.isInteger(value) || value <= product.price_inr)) {
          event.target.value = product.compare_at_inr ?? "";
          return toast("The original price must be higher than the selling price", "bad");
        }
        await save(product, { compare_at_inr: value }, "Original price saved");
      });
      q(".status-input").addEventListener("change", (event) => save(product, { status: event.target.value }, `${product.name} updated`));
    });
  };

  body.querySelector("#new").addEventListener("click", () => productForm(null, ctx));
  body.querySelector("#pm-search").addEventListener("input", (event) => {
    search = event.target.value;
    drawList();
  });
  drawList();
  drawBulk();
}
