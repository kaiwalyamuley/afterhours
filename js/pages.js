// Pages tab: change the home and help pages, with a live phone preview.
import { api, DEMO } from "./api.js";
import { esc, toast } from "./ui.js";
import { HOME_SECTIONS, homeLayout } from "./home-layout.js";

const previewUrl = (hash) => `index.html?${DEMO ? "demo=1&" : ""}preview=1${hash}`;
const sectionName = (id) => HOME_SECTIONS.find(([key]) => key === id)[1];

const toggle = (attrs, on, label) => `<label class="switch"><input type="checkbox" ${attrs} ${on ? "checked" : ""} aria-label="${esc(label)}"><i></i></label>`;

export function drawPages(body, ctx) {
  const settings = ctx.store.settings;
  const layout = homeLayout(settings.home_layout);
  let page = "home";
  let timer;

  body.innerHTML = `<div class="chips"><button class="chip on" data-page="home">Home page</button><button class="chip" data-page="help">Help page</button></div>
    <div class="pg-layout">
      <div id="pg-editor"></div>
      <aside class="pg-preview">
        <div class="row-between small"><span class="muted" id="pg-status">Changes save by themselves</span><a class="inline-link" id="pg-open" href="${previewUrl("#/")}" target="_blank" rel="noopener">Open</a></div>
        <div class="pg-phone"><iframe id="pg-frame" title="Store preview" src="${previewUrl("#/")}"></iframe></div>
      </aside>
    </div>`;

  const status = body.querySelector("#pg-status");
  const frame = body.querySelector("#pg-frame");
  const hash = () => (page === "home" ? "#/" : "#/help");
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
    const field = (key, label, value, max, area) => `<label class="field"><span>${label}</span>${area ? `<textarea data-hero="${key}" rows="2" maxlength="${max}">${esc(value)}</textarea>` : `<input data-hero="${key}" maxlength="${max}" value="${esc(value)}">`}</label>`;
    editor.innerHTML = `<section class="panel pg-card">
        <div class="row-between"><div><h3>Announcement bar</h3><p class="muted small">A one-line message at the top of the home page.</p></div>${toggle("data-banner-on", layout.banner.on, "Show the announcement bar")}</div>
        <input id="pg-banner" maxlength="120" placeholder="Example: Free shipping this Diwali" value="${esc(layout.banner.text)}">
      </section>
      <section class="panel pg-card">
        <h3>Top of the page</h3>
        ${field("kicker", "Small line above the headline", layout.hero.kicker, 60)}
        <div class="cols">${field("line1", "Headline", layout.hero.line1, 30)}${field("line2", "Headline, orange line", layout.hero.line2, 30)}</div>
        ${field("text", "Text under the headline", layout.hero.text, 180, true)}
        <label class="field"><span>Featured tee</span><select data-hero="product"><option value="">Newest tee</option>${ctx.store.products.filter((p) => p.status !== "hidden").map((p) => `<option value="${esc(p.slug)}" ${p.slug === layout.hero.product ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
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
    editor.querySelectorAll("[data-collection]").forEach((input) => input.addEventListener("change", () => {
      const name = input.dataset.collection;
      layout.collections = input.checked ? [...layout.collections, name] : layout.collections.filter((c) => c !== name);
      saveHome(0);
    }));
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
        ${area("return_policy", "Return and exchange policy", "Example: Damaged or wrongly printed tees are replaced if you contact us within 3 days of delivery.", 4, 1200)}
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
