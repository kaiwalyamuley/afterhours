// Pages tab: change the home and help pages, with a live phone preview.
import { api, DEMO } from "./api.js";
import { esc, toast } from "./ui.js";
import { HOME_SECTIONS, homeLayout, DEFAULT_LOOKBOOK } from "./home-layout.js";
import { CHARACTERS } from "./characters.js";
import { usableFiles } from "./product-form.js";

const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

const previewUrl = (hash) => `index.html?${DEMO ? "demo=1&" : ""}preview=1${hash}`;
const sectionName = (id) => HOME_SECTIONS.find(([key]) => key === id)[1];

const toggle = (attrs, on, label) => `<label class="switch"><input type="checkbox" ${attrs} ${on ? "checked" : ""} aria-label="${esc(label)}"><i></i></label>`;

export function drawPages(body, ctx) {
  const settings = ctx.store.settings;
  const layout = homeLayout(settings.home_layout);
  let page = "home";
  let timer;

  body.innerHTML = `<div class="chips"><button class="chip on" data-page="home">Home page</button><button class="chip" data-page="showcase">Banners and lookbook</button><button class="chip" data-page="gang">Family chat</button><button class="chip" data-page="help">Help page</button></div>
    <div class="pg-layout">
      <div id="pg-editor"></div>
      <aside class="pg-preview">
        <div class="row-between small"><span class="muted" id="pg-status">Changes save by themselves</span><a class="inline-link" id="pg-open" href="${previewUrl("#/")}" target="_blank" rel="noopener">Open</a></div>
        <div class="pg-phone"><iframe id="pg-frame" title="Store preview" src="${previewUrl("#/")}"></iframe></div>
      </aside>
    </div>`;

  const status = body.querySelector("#pg-status");
  const frame = body.querySelector("#pg-frame");
  const hash = () => (page === "help" ? "#/help" : "#/");
  const showPreview = (reload) => {
    const url = previewUrl(hash());
    body.querySelector("#pg-open").href = url;
    if (reload) frame.contentWindow.location.reload();
    else frame.src = url;
  };

  const persist = async (values, reload = true) => {
    status.textContent = "Saving...";
    try {
      await api.saveSettings(values);
      Object.assign(settings, values);
      status.textContent = "Saved";
      if (reload) showPreview(true);
    } catch (error) {
      status.textContent = "Not saved";
      toast(error.message, "bad");
    }
  };
  const saveHome = (wait = 500) => {
    status.textContent = "Saving...";
    clearTimeout(timer);
    timer = setTimeout(() => persist({ home_layout: layout }), wait);
  };

  const drawHome = (editor) => {
    const collections = [...new Set(ctx.store.products.filter((p) => p.status !== "hidden").map((p) => p.collection))];
    const live = ctx.store.products.filter((p) => p.status !== "hidden");
    const field = (key, label, value, max, area) => `<label class="field"><span>${label}</span>${area ? `<textarea data-hero="${key}" rows="2" maxlength="${max}">${esc(value)}</textarea>` : `<input data-hero="${key}" maxlength="${max}" value="${esc(value)}">`}</label>`;
    editor.innerHTML = `<section class="panel pg-card">
        <div class="row-between"><div><h3>Announcement bar</h3><p class="muted small">A one-line message at the top of the home page.</p></div>${toggle("data-banner-on", layout.banner.on, "Show the announcement bar")}</div>
        <input id="pg-banner" maxlength="120" placeholder="Example: Free shipping this Diwali" value="${esc(layout.banner.text)}">
      </section>
      <section class="panel pg-card">
        <h3>Top of the page</h3>
        ${field("kicker", "Small line above the headline", layout.hero.kicker, 60)}
        <div class="cols">${field("line1", "Headline", layout.hero.line1, 30)}${field("line2", "Headline, highlighted line", layout.hero.line2, 30)}</div>
        ${field("text", "Text under the headline", layout.hero.text, 180, true)}
        <label class="field"><span>Featured product</span><select data-hero="product"><option value="">Newest product</option>${ctx.store.products.filter((p) => p.status !== "hidden").map((p) => `<option value="${esc(p.slug)}" ${p.slug === layout.hero.product ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      </section>
      <section class="panel pg-card">
        <h3>Sections</h3>
        <p class="muted small">Switch sections on or off, and use the arrows to change their order.</p>
        <div class="pg-sections">${layout.sections.map((s, i) => `<div class="pg-section ${s.on ? "" : "off"}">
          <span>${esc(sectionName(s.id))}</span>
          <button type="button" data-up="${i}" aria-label="Move ${esc(sectionName(s.id))} up" ${i ? "" : "disabled"}>↑</button>
          <button type="button" data-down="${i}" aria-label="Move ${esc(sectionName(s.id))} down" ${i === layout.sections.length - 1 ? "disabled" : ""}>↓</button>
          ${toggle(`data-section="${i}"`, s.on, `Show ${sectionName(s.id)}`)}
        </div>`).join("")}</div>
      </section>
      <section class="panel pg-card">
        <h3>Picked for you</h3>
        <p class="muted small">Tick products to show together on the home page. Switch the section on in Sections above.</p>
        <input data-title="featured_title" maxlength="40" placeholder="Section title, e.g. Wedding season picks" value="${esc(layout.featured_title)}">
        <div class="pick-list">${live.map((p) => `<label class="check"><input type="checkbox" data-feature="${esc(p.slug)}" ${layout.featured.includes(p.slug) ? "checked" : ""}><span>${esc(p.name)} <small class="muted">${esc(p.collection)}</small></span></label>`).join("") || '<p class="muted small">Add products first.</p>'}</div>
      </section>
      <section class="panel pg-card">
        <h3>Scrolling text and footer</h3>
        <label class="field"><span>Scrolling words, one per line</span><textarea data-list="marquee" rows="3" placeholder="Leave empty to use your categories and offers">${esc(layout.marquee.join("\n"))}</textarea></label>
        <label class="field"><span>Footer line</span><input data-title="footer_text" maxlength="160" value="${esc(layout.footer_text)}" placeholder="Sarees for every celebration, custom tees printed after you order, and more on the way."></label>
      </section>
      ${collections.length > 1 ? `<section class="panel pg-card">
        <h3>Collections to show</h3>
        <p class="muted small">Leave all unticked to show your three newest collections automatically.</p>
        ${collections.map((c) => `<label class="check"><input type="checkbox" data-collection="${esc(c)}" ${layout.collections.includes(c) ? "checked" : ""}><span>${esc(c)}</span></label>`).join("")}
      </section>` : ""}`;

    editor.querySelector("[data-banner-on]").addEventListener("change", (event) => {
      layout.banner.on = event.target.checked;
      saveHome(0);
    });
    editor.querySelector("#pg-banner").addEventListener("input", (event) => {
      layout.banner.text = event.target.value.trim();
      saveHome();
    });
    editor.querySelectorAll("[data-hero]").forEach((input) => input.addEventListener("input", () => {
      layout.hero[input.dataset.hero] = input.value;
      saveHome();
    }));
    const move = (from, to) => {
      layout.sections.splice(to, 0, ...layout.sections.splice(from, 1));
      drawHome(editor);
      saveHome(0);
    };
    editor.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => move(Number(b.dataset.up), Number(b.dataset.up) - 1)));
    editor.querySelectorAll("[data-down]").forEach((b) => b.addEventListener("click", () => move(Number(b.dataset.down), Number(b.dataset.down) + 1)));
    editor.querySelectorAll("[data-section]").forEach((input) => input.addEventListener("change", () => {
      layout.sections[Number(input.dataset.section)].on = input.checked;
      input.closest(".pg-section").classList.toggle("off", !input.checked);
      saveHome(0);
    }));
    bindCommon(editor);
    editor.querySelectorAll("[data-feature]").forEach((input) => input.addEventListener("change", () => {
      const slug = input.dataset.feature;
      layout.featured = input.checked ? [...layout.featured, slug] : layout.featured.filter((x) => x !== slug);
      saveHome(0);
    }));
    editor.querySelectorAll("[data-collection]").forEach((input) => input.addEventListener("change", () => {
      const name = input.dataset.collection;
      layout.collections = input.checked ? [...layout.collections, name] : layout.collections.filter((c) => c !== name);
      saveHome(0);
    }));
  };

  /** Title, list and other plain inputs shared by the editors. */
  const bindCommon = (editor) => {
    editor.querySelectorAll("[data-title]").forEach((input) => input.addEventListener("input", () => {
      layout[input.dataset.title] = input.value.trim();
      saveHome();
    }));
    editor.querySelectorAll("[data-list]").forEach((input) => input.addEventListener("input", () => {
      layout[input.dataset.list] = input.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 12);
      saveHome();
    }));
  };
  const linkOptions = (value) => {
    const options = [["#/shop", "Shop everything"], ["#/deals", "Deals of the day"], ...ctx.store.categories.map((c) => [`#/c/${c.slug}`, `Category: ${c.name}`]),
      ...[...new Set(ctx.store.products.map((p) => p.collection))].map((c) => [`#/shop/${encodeURIComponent(c)}`, `Collection: ${c}`]),
      ...ctx.store.products.filter((p) => p.status !== "hidden").map((p) => [`#/p/${p.slug}`, `Product: ${p.name}`])];
    if (value && !options.some(([v]) => v === value)) options.unshift([value, value]);
    return options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("");
  };
  const upload = async (file, button) => {
    const [ok] = usableFiles([file], PHOTO_TYPES, 1);
    if (!ok) return null;
    const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = "Uploading..."; }
    try {
      return await api.upload(ok, "home");
    } catch (error) {
      toast(error.message, "bad");
      return null;
    } finally {
      if (button) { button.disabled = false; button.textContent = label; }
    }
  };

  const drawShowcase = (editor) => {
    const looks = layout.lookbook.length ? layout.lookbook : DEFAULT_LOOKBOOK.map((x) => ({ ...x }));
    editor.innerHTML = `<section class="panel pg-card">
        <h3>Banners</h3>
        <p class="muted small">Big sliding pictures at the top of the home page, like Diwali offers or a new collection. Wide images work best (about 1600 × 600). With no banners, the page shows your headline and newest products instead.</p>
        <div class="banner-edit">${layout.banners.map((b, i) => `<div class="banner-row" data-b="${i}">
          <div class="banner-thumb" style="background-image:url('${esc(b.image)}')"></div>
          <div class="banner-fields">
            <div class="cols"><input data-bk="kicker" maxlength="40" placeholder="Small line, e.g. Diwali sale" value="${esc(b.kicker || "")}"><input data-bk="title" maxlength="60" placeholder="Headline, e.g. Up to 40% off silks" value="${esc(b.title || "")}"></div>
            <input data-bk="text" maxlength="120" placeholder="Text under the headline (optional)" value="${esc(b.text || "")}">
            <div class="cols"><input data-bk="button" maxlength="24" placeholder="Button, e.g. Shop now" value="${esc(b.button || "")}"><select data-bk="link" aria-label="Where the banner goes">${linkOptions(b.link || "#/shop")}</select></div>
          </div>
          <div class="banner-tools"><button type="button" data-bup ${i ? "" : "disabled"} aria-label="Move up">↑</button><button type="button" data-bdown ${i === layout.banners.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button><button type="button" class="pf-x" data-bdel aria-label="Remove banner">×</button></div>
        </div>`).join("") || '<p class="muted small">No banners yet.</p>'}</div>
        <label class="btn small"><input type="file" accept="${PHOTO_TYPES.join(",")}" hidden id="banner-add">Add a banner picture</label>
      </section>
      <section class="panel pg-card">
        <h3>Lookbook</h3>
        <p class="muted small">Photos in the sliding Lookbook strip. Add a caption and where a tap should go. Tall photos work best.</p>
        <input data-title="lookbook_title" maxlength="50" placeholder="Section title, e.g. Worn after hours" value="${esc(layout.lookbook_title)}">
        <div class="look-edit">${looks.map((l, i) => `<div class="look-row" data-l="${i}">
          <img src="${esc(l.src)}" alt="">
          <input data-lk="caption" maxlength="60" placeholder="Caption (optional)" value="${esc(l.caption || "")}">
          <select data-lk="link" aria-label="Where this photo goes"><option value="">No link</option>${linkOptions(l.link || "")}</select>
          <div class="banner-tools"><button type="button" data-lup ${i ? "" : "disabled"} aria-label="Move left">↑</button><button type="button" data-ldown ${i === looks.length - 1 ? "disabled" : ""} aria-label="Move right">↓</button><button type="button" class="pf-x" data-ldel aria-label="Remove photo">×</button></div>
        </div>`).join("")}</div>
        <label class="btn small"><input type="file" accept="${PHOTO_TYPES.join(",")}" multiple hidden id="look-add">Add lookbook photos</label>
        ${layout.lookbook.length ? '<button type="button" class="linkish" id="look-reset">Go back to the original photos</button>' : ""}
      </section>`;
    bindCommon(editor);
    const redraw = () => drawShowcase(editor);
    const saveBanners = (wait) => saveHome(wait);
    editor.querySelectorAll(".banner-row").forEach((row) => {
      const i = Number(row.dataset.b);
      const b = layout.banners[i];
      row.querySelectorAll("[data-bk]").forEach((input) => input.addEventListener(input.tagName === "SELECT" ? "change" : "input", () => { b[input.dataset.bk] = input.value.trim(); saveBanners(); }));
      row.querySelector("[data-bup]").addEventListener("click", () => { layout.banners.splice(i - 1, 0, ...layout.banners.splice(i, 1)); redraw(); saveBanners(0); });
      row.querySelector("[data-bdown]").addEventListener("click", () => { layout.banners.splice(i + 1, 0, ...layout.banners.splice(i, 1)); redraw(); saveBanners(0); });
      row.querySelector("[data-bdel]").addEventListener("click", () => { if (!confirm("Remove this banner?")) return; layout.banners.splice(i, 1); redraw(); saveBanners(0); });
    });
    editor.querySelector("#banner-add").addEventListener("change", async (event) => {
      const src = await upload(event.target.files[0], event.target.parentElement);
      if (!src) return;
      layout.banners.push({ image: src, kicker: "", title: "", text: "", button: "Shop now", link: "#/shop" });
      redraw();
      saveBanners(0);
    });
    const keepLooks = () => { layout.lookbook = looks; };
    editor.querySelectorAll(".look-row").forEach((row) => {
      const i = Number(row.dataset.l);
      row.querySelectorAll("[data-lk]").forEach((input) => input.addEventListener(input.tagName === "SELECT" ? "change" : "input", () => { looks[i][input.dataset.lk] = input.value.trim(); keepLooks(); saveHome(); }));
      row.querySelector("[data-lup]").addEventListener("click", () => { looks.splice(i - 1, 0, ...looks.splice(i, 1)); keepLooks(); redraw(); saveHome(0); });
      row.querySelector("[data-ldown]").addEventListener("click", () => { looks.splice(i + 1, 0, ...looks.splice(i, 1)); keepLooks(); redraw(); saveHome(0); });
      row.querySelector("[data-ldel]").addEventListener("click", () => {
        if (looks.length === 1) return toast("Keep at least one photo, or switch the Lookbook section off", "bad");
        looks.splice(i, 1); keepLooks(); redraw(); saveHome(0);
      });
    });
    editor.querySelector("#look-add").addEventListener("change", async (event) => {
      const button = event.target.parentElement;
      for (const file of [...event.target.files].slice(0, 12)) {
        const src = await upload(file, button);
        if (src) looks.push({ src, caption: "", link: "" });
      }
      keepLooks();
      redraw();
      saveHome(0);
    });
    editor.querySelector("#look-reset")?.addEventListener("click", () => { layout.lookbook = []; redraw(); saveHome(0); });
  };

  const drawGang = (editor) => {
    const c = layout.characters;
    const live = ctx.store.products.filter((p) => p.status === "live");
    editor.innerHTML = `<section class="panel pg-card">
        <div class="row-between"><div><h3>Family chat</h3><p class="muted small">A small cartoon family on a sofa chatting about what to buy from your store. Each message that mentions a product shows its picture and price, and a tap opens it. The chats write themselves from your products' names, prices, discounts and details.</p></div>${toggle("data-gang-on", c.on !== false, "Show the family chat")}</div>
        <input data-gang="title" maxlength="50" placeholder="Strip title, e.g. What should we buy?" value="${esc(c.title || "")}">
      </section>
      <section class="panel pg-card">
        <h3>Products they talk about</h3>
        <p class="muted small">Leave all unticked to use your newest products automatically. Up to 12 are used.</p>
        <div class="pick-list">${live.map((p) => `<label class="check"><input type="checkbox" data-gang-product="${esc(p.slug)}" ${c.products.includes(p.slug) ? "checked" : ""}><span>${esc(p.name)} <small class="muted">${esc(p.collection)}</small></span></label>`).join("") || '<p class="muted small">Add live products first.</p>'}</div>
      </section>
      <section class="panel pg-card">
        <h3>Family names</h3>
        <div class="spec-grid">${CHARACTERS.map((who) => `<label class="field"><span>${esc(who.role)}</span><input data-gang-name="${who.id}" maxlength="20" value="${esc(c.names?.[who.id] || "")}" placeholder="${esc(who.name)}"></label>`).join("")}</div>
      </section>`;
    const save = () => { layout.characters = c; saveHome(); };
    editor.querySelector("[data-gang-on]").addEventListener("change", (event) => { c.on = event.target.checked; layout.characters = c; saveHome(0); });
    editor.querySelector("[data-gang]").addEventListener("input", (event) => { c.title = event.target.value.trim(); save(); });
    editor.querySelectorAll("[data-gang-product]").forEach((input) => input.addEventListener("change", () => {
      const slug = input.dataset.gangProduct;
      c.products = input.checked ? [...c.products, slug] : c.products.filter((x) => x !== slug);
      layout.characters = c;
      saveHome(0);
    }));
    editor.querySelectorAll("[data-gang-name]").forEach((input) => input.addEventListener("input", () => { c.names = { ...c.names, [input.dataset.gangName]: input.value.trim() }; save(); }));

  };

  const drawHelp = (editor) => {
    const text = (name, label, hint) => `<label class="field"><span>${label}</span><input data-help="${name}" value="${esc(settings[name] || "")}" placeholder="${esc(hint)}"></label>`;
    const area = (name, label, hint, rows, max) => `<label class="field"><span>${label}</span><textarea data-help="${name}" rows="${rows}" maxlength="${max}" placeholder="${esc(hint)}">${esc(settings[name] || "")}</textarea></label>`;
    editor.innerHTML = `<section class="panel pg-card">
        <h3>Contact details</h3>
        <p class="muted small">Blank items stay hidden from customers.</p>
        <div class="cols">${text("support_phone", "Helpline and WhatsApp number", "10-digit mobile number")}${text("support_email", "Support email", "help@yourbrand.com")}</div>
        <div class="cols">${text("support_hours", "Support hours", "Example: Mon to Sat, 10 am to 7 pm")}${text("instagram_url", "Instagram link", "https://instagram.com/yourpage")}</div>
      </section>
      <section class="panel pg-card">
        <h3>Seller and policy</h3>
        ${area("business_address", "Business address", "Shown on the Help page and footer", 2, 300)}
        ${area("return_policy", "Return and exchange policy", "Example: Damaged sarees or wrongly printed tees are replaced if you contact us within 3 days of delivery.", 4, 1200)}
      </section>`;
    editor.querySelectorAll("[data-help]").forEach((input) => input.addEventListener("change", () => {
      const name = input.dataset.help;
      const value = input.value.trim();
      if (name === "instagram_url" && value && !value.startsWith("https://")) return toast("The Instagram link must start with https://", "bad");
      if (name === "support_phone" && value && !/^(\+?91)?[6-9][0-9]{9}$/.test(value.replace(/[\s-]/g, ""))) return toast("Please enter a valid 10-digit helpline number", "bad");
      persist({ [name]: value });
    }));
  };

  const drawEditor = () => {
    const editor = body.querySelector("#pg-editor");
    if (page === "home") drawHome(editor);
    else if (page === "showcase") drawShowcase(editor);
    else if (page === "gang") drawGang(editor);
    else drawHelp(editor);
  };
  body.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => {
    page = b.dataset.page;
    body.querySelectorAll("[data-page]").forEach((x) => x.classList.toggle("on", x === b));
    drawEditor();
    showPreview(false);
  }));
  drawEditor();
}
