// Categories tab: the owner adds kinds of products (Kurtas, Jewellery...) with
// their sizes and the details each product of that kind should list.
import { api } from "./api.js";
import { esc, toast, openModal, FREE_SIZE } from "./ui.js";
import { segments } from "./product-form.js";

const FIELD_TYPES = [["select", "Choice list"], ["text", "Short text"], ["number", "Number"], ["yesno", "Yes or no"]];
const ART = [["photo", "Photos"], ["tee", "Printed tee mockup"], ["saree", "Saree drawing until photos"]];
const SIZE_SETS = [
  ["One size", [FREE_SIZE]],
  ["Clothing", ["XS", "S", "M", "L", "XL", "XXL", "3XL"]],
  ["Waist", ["28", "30", "32", "34", "36", "38", "40"]],
  ["Kids", ["2-3Y", "4-5Y", "6-7Y", "8-9Y", "10-11Y", "12-13Y"]],
  ["Footwear", ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10"]],
];

const keyOf = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "detail";
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function categoryForm(category, ctx) {
  const c = category || { name: "", tagline: "", art: "photo", sizes: [FREE_SIZE], fields: [], size_fit: "", care: "", status: "live", sort: (Math.max(0, ...ctx.store.categories.map((x) => x.sort)) + 10) };
  const state = {
    sizes: [...c.sizes],
    fields: (c.fields || []).map((f) => ({ ...f, options: [...(f.options || [])] })),
    dirty: false,
    saving: false,
  };
  openModal(`<h2>${category ? `Edit ${esc(c.name)}` : "Add a category"}</h2>
    <form id="cat-form" class="form" novalidate>
      <div class="cols">
        <label class="field"><span>Name</span><input name="name" maxlength="40" required value="${esc(c.name)}" placeholder="Example: Kurtas"></label>
        <label class="field"><span>Short line</span><input name="tagline" maxlength="80" value="${esc(c.tagline)}" placeholder="Shown on the category tile"></label>
      </div>
      ${category ? `<p class="muted small">Web address: <code>#/c/${esc(c.slug)}</code></p>` : '<p class="muted small" id="cat-slug"></p>'}
      <div class="field"><span class="pf-label">Pictures</span>${segments("art", ART, c.art, "Pictures")}<small class="muted">Printed tee mockup shows your print files on a tee. Choose Photos for almost everything else.</small></div>
      <div class="field"><span class="pf-label">Sizes customers choose from</span>
        <div class="pf-quick">${SIZE_SETS.map(([label], i) => `<button type="button" class="pf-chip" data-set="${i}">${label}</button>`).join("")}</div>
        <div class="pf-sizes" id="cat-sizes"></div>
        <div class="coupon-row"><label class="field"><span>Add a size</span><input id="cat-size" maxlength="12" placeholder="Example: 42"></label><button type="button" class="btn" id="cat-size-add">Add</button></div>
        <small class="muted">"Free Size" alone means customers don't pick a size. Each product can switch off sizes it doesn't have.</small>
      </div>
      <div class="field"><span class="pf-label">Product details to fill in</span>
        <div class="cat-fields" id="cat-fields"></div>
        <button type="button" class="btn small" id="cat-field-add">Add a detail</button>
        <small class="muted">Examples: Fabric, Border, Fit, Neck, Work. Choice lists can be shop filters.</small>
      </div>
      <label class="field"><span>Default Size and fit text</span><textarea name="size_fit" rows="2" maxlength="600">${esc(c.size_fit)}</textarea></label>
      <label class="field"><span>Default Care text</span><textarea name="care" rows="2" maxlength="400">${esc(c.care)}</textarea></label>
      <div class="cols">
        <div class="field"><span class="pf-label">Visibility</span>${segments("status", [["live", "Live"], ["hidden", "Hidden"]], c.status, "Visibility")}</div>
        <label class="field"><span>Order in menus</span><input name="sort" type="number" step="1" value="${c.sort}"><small class="muted">Lower numbers come first.</small></label>
      </div>
      <p class="error" id="cat-error" hidden></p>
      <button class="btn primary wide" id="cat-save">Save category</button>
    </form>`, (modal, close) => {
    const form = modal.querySelector("#cat-form");
    const el = form.elements;
    const $ = (s) => modal.querySelector(s);
    const drawSizes = () => {
      $("#cat-sizes").innerHTML = state.sizes.map((s, i) => `<button type="button" class="size on" data-size="${i}" title="Remove ${esc(s)}">${esc(s)} ×</button>`).join("") || '<span class="muted small">No sizes yet.</span>';
      $("#cat-sizes").querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => {
        state.sizes.splice(Number(b.dataset.size), 1);
        state.dirty = true;
        drawSizes();
      }));
    };
    const drawFields = () => {
      $("#cat-fields").innerHTML = state.fields.map((f, i) => `<div class="cat-field" data-i="${i}">
        <input data-k="label" maxlength="30" placeholder="Detail name, e.g. Border" value="${esc(f.label)}" aria-label="Detail ${i + 1} name">
        <select data-k="type" aria-label="Detail ${i + 1} type">${FIELD_TYPES.map(([v, l]) => `<option value="${v}" ${v === f.type ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${f.type === "select" ? `<input data-k="options" class="wide-cell" placeholder="Choices, separated by commas" value="${esc(f.options.join(", "))}" aria-label="Detail ${i + 1} choices">` : ""}
        ${f.type === "number" ? `<input data-k="unit" maxlength="12" placeholder="Unit, e.g. metres" value="${esc(f.unit || "")}" aria-label="Detail ${i + 1} unit">` : ""}
        ${f.type === "select" ? `<label class="check tiny"><input type="checkbox" data-k="filter" ${f.filter ? "checked" : ""}><span>Shop filter</span></label>` : ""}
        <span class="cat-field-tools"><button type="button" data-up ${i ? "" : "disabled"} aria-label="Move up">↑</button><button type="button" data-down ${i === state.fields.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button><button type="button" class="pf-x" data-del aria-label="Remove">×</button></span>
      </div>`).join("") || '<p class="muted small">No details yet.</p>';
      $("#cat-fields").querySelectorAll(".cat-field").forEach((row) => {
        const f = state.fields[Number(row.dataset.i)];
        row.querySelectorAll("[data-k]").forEach((input) => input.addEventListener(input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input", () => {
          state.dirty = true;
          const k = input.dataset.k;
          if (k === "options") f.options = input.value.split(",").map((o) => o.trim()).filter(Boolean);
          else if (k === "filter") f.filter = input.checked;
          else f[k] = input.value;
          if (k === "type") drawFields();
        }));
        const i = Number(row.dataset.i);
        row.querySelector("[data-up]").addEventListener("click", () => { state.fields.splice(i - 1, 0, ...state.fields.splice(i, 1)); drawFields(); });
        row.querySelector("[data-down]").addEventListener("click", () => { state.fields.splice(i + 1, 0, ...state.fields.splice(i, 1)); drawFields(); });
        row.querySelector("[data-del]").addEventListener("click", () => { state.fields.splice(i, 1); state.dirty = true; drawFields(); });
      });
    };
    modal.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => {
      state.sizes = [...SIZE_SETS[Number(b.dataset.set)][1]];
      state.dirty = true;
      drawSizes();
    }));
    const addSize = () => {
      const value = $("#cat-size").value.trim();
      if (!value) return;
      if (state.sizes.includes(value)) return toast(`${value} is already there`, "bad");
      state.sizes = [...state.sizes.filter((s) => s !== FREE_SIZE), value];
      $("#cat-size").value = "";
      state.dirty = true;
      drawSizes();
    };
    $("#cat-size-add").addEventListener("click", addSize);
    $("#cat-size").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addSize(); } });
    $("#cat-field-add").addEventListener("click", () => {
      state.fields.push({ key: "", label: "", type: "select", options: [], filter: false });
      drawFields();
      $("#cat-fields").lastElementChild.querySelector("input").focus();
    });
    form.addEventListener("input", (event) => {
      state.dirty = true;
      if (!category && event.target.name === "name") $("#cat-slug").textContent = el.name.value.trim() ? `Web address: #/c/${slugOf(el.name.value)}` : "";
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const box = $("#cat-error");
      const fail = (m) => { box.textContent = m; box.hidden = false; };
      box.hidden = true;
      const name = el.name.value.trim();
      if (!name) return fail("Give the category a name.");
      const slug = category ? c.slug : slugOf(name);
      if (!slug) return fail("Use letters or numbers in the name.");
      if (!category && ctx.store.categories.some((x) => x.slug === slug)) return fail("A category with this name already exists.");
      if (!state.sizes.length) return fail("Add at least one size, or choose One size.");
      if (state.fields.some((f) => !f.label.trim())) return fail("Give every detail a name, or remove it.");
      if (state.fields.some((f) => f.type === "select" && !f.options.length)) return fail("Add choices to every choice list.");
      const used = new Set();
      const fields = state.fields.map((f) => {
        let key = f.key || keyOf(f.label);
        while (used.has(key)) key = `${key}_2`;
        used.add(key);
        return { key, label: f.label.trim(), type: f.type, options: f.type === "select" ? f.options : [], ...(f.type === "number" && f.unit ? { unit: f.unit.trim() } : {}), filter: f.type === "select" && Boolean(f.filter) };
      });
      state.saving = true;
      $("#cat-save").disabled = true;
      try {
        await api.saveCategory({
          ...(category ? { id: category.id } : { slug }),
          name, tagline: el.tagline.value.trim(), art: el.art.value, sizes: state.sizes, fields,
          size_fit: el.size_fit.value.trim(), care: el.care.value.trim(), status: el.status.value, sort: Number(el.sort.value) || 100,
        });
        state.dirty = false;
        close();
        toast(category ? "Category saved" : `${name} added. You can now add products to it.`);
        await ctx.refresh();
        await ctx.redraw();
      } catch (error) {
        state.saving = false;
        $("#cat-save").disabled = false;
        fail(error.message);
      }
    });
    drawSizes();
    drawFields();
  }, null, { className: "cat-modal", canClose: () => !state.saving && (!state.dirty || confirm("Discard your changes to this category?")) });
}

export function drawCategories(body, ctx) {
  const { categories, products } = ctx.store;
  const isOwner = ctx.store.profile.access.owner;
  const count = (slug) => products.filter((p) => p.category === slug).length;
  body.innerHTML = `<div class="row-between toolbar"><p class="muted">Each category gets its own page, menu link and filters in the store.</p><button class="btn small primary" id="cat-new">Add a category</button></div>
    <div class="cat-list">${categories.map((c) => `<article class="panel cat-item">
      <div><h3>${esc(c.name)} ${c.status === "hidden" ? '<span class="pm-kind">Hidden</span>' : ""}</h3>
        <p class="muted small">${esc(c.tagline || "No short line")}</p>
        <p class="small">${count(c.slug)} product${count(c.slug) === 1 ? "" : "s"} · ${c.sizes.length === 1 && c.sizes[0] === FREE_SIZE ? "One size" : `Sizes ${esc(c.sizes.join(", "))}`}</p>
        <p class="muted small">${c.fields.length ? `Details: ${esc(c.fields.map((f) => f.label).join(", "))}` : "No details yet"}</p></div>
      <div class="row-actions"><button class="btn small" data-edit="${esc(c.id)}">Edit</button>${isOwner ? `<button class="btn small danger" data-del="${esc(c.id)}" ${count(c.slug) ? 'disabled title="Move or delete its products first"' : ""}>Delete</button>` : ""}</div>
    </article>`).join("")}</div>`;
  body.querySelector("#cat-new").addEventListener("click", () => categoryForm(null, ctx));
  body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => categoryForm(categories.find((c) => c.id === b.dataset.edit), ctx)));
  body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const c = categories.find((x) => x.id === b.dataset.del);
    if (!confirm(`Delete the ${c.name} category? This cannot be undone.`)) return;
    try {
      await api.deleteCategory(c.id);
      toast(`${c.name} deleted`);
      await ctx.refresh();
      await ctx.redraw();
    } catch (error) {
      toast(error.message, "bad");
    }
  }));
}
