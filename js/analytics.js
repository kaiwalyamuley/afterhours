// Owner-only margin calculator and detailed analytics.
import { api } from "./api.js";
import { esc, money, toast } from "./ui.js";
import { withDefaults, teeCost, unitEconomics, suggestPrices } from "./margin.js";

const whole = (n) => money(Math.round(n));
const percent = (n) => `${Math.round(n)}%`;

const COST_FIELDS = [
  ["blank", "Blank tee (₹)"], ["print", "Printing, front and back (₹)"], ["packing", "Packing (₹)"],
  ["courier", "Courier per parcel (₹)"], ["returnCourier", "Return courier per refused parcel (₹)"], ["adCost", "Ad spend per order (₹)"],
  ["rtoPct", "Parcels refused or returned (%)"], ["feePct", "Payment and COD fees (%)"], ["discountPct", "Average discount given (%)"],
  ["gstPct", "GST included in price (%)"], ["targetPct", "Target margin (%)"], ["premiumPct", "Premium margin (%)"],
];

const costTable = (rows) => `<table class="rank-table"><tbody>${rows.map(([label, value, strong]) => `<tr class="${strong ? "strong" : ""}"><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join("")}</tbody></table>`;

export async function drawMargin(body, ctx) {
  const [record, overrides] = await Promise.all([api.costs(), api.productCosts()]);
  const shop = ctx.store.settings;
  let costs = withDefaults(record.costs);
  let confirmed = record.confirmed;
  const products = ctx.store.products;
  const overrideOf = (id) => (overrides.has(id) ? overrides.get(id) : undefined);

  body.innerHTML = `${confirmed ? "" : '<p class="notice-box">These include starter estimates. Replace them with your real costs and save, so the suggested prices can be trusted.</p>'}
    <div class="two margin-grid">
      <form id="costs-form" class="panel form">
        <h3>Your costs</h3>
        <div class="cols">${COST_FIELDS.map(([key, label]) => `<label class="field"><span>${label}</span><input name="${key}" type="number" min="0" max="100000" step="0.5" required value="${esc(costs[key])}"></label>`).join("")}</div>
        <button class="btn primary wide">Save costs</button>
      </form>
      <div class="stack">
        <section class="panel"><h3>Suggested selling price</h3><div id="margin-suggest"></div></section>
        <section class="panel">
          <h3>Check a price</h3>
          <label class="field"><span>Selling price (₹)</span><input id="check-price" type="number" min="1" step="1" value="${products[0]?.price_inr || 899}"></label>
          <div id="margin-breakdown"></div>
        </section>
      </div>
    </div>
    <div class="report-grid margin-more">
      <section class="panel"><h3>If you change the price</h3><div id="price-steps"></div></section>
      <section class="panel"><h3>If refused parcels change</h3><div id="refusal-steps"></div></section>
    </div>
    <section class="panel"><h3>Margin on your products</h3><div class="size-table-wrap" id="product-margins"></div></section>
    <p class="muted small">Results are averages per delivered single-tee order. They spread the cost of refused parcels across delivered orders and assume a refused tee cannot be resold.</p>`;

  const form = body.querySelector("#costs-form");
  const readCosts = () => Object.fromEntries(COST_FIELDS.map(([key]) => [key, Math.max(Number(form.elements[key].value) || 0, 0)]));

  const refresh = () => {
    costs = readCosts();
    const s = suggestPrices(costs, shop);
    const tile = (label, option) => `<div class="stat"><span class="mono muted">${label}</span><strong>${option ? money(option.price) : "Not possible"}</strong><small class="muted">${option ? `${whole(option.profit)} profit, ${percent(option.marginPct)}` : "Lower your target"}</small></div>`;
    body.querySelector("#margin-suggest").innerHTML = `<div class="stats price-tiles">${tile("Break-even", s.breakEven)}${tile("Suggested", s.suggested)}${tile("Premium", s.premium)}</div>`;

    const price = Math.max(Number(body.querySelector("#check-price").value) || 0, 1);
    const u = unitEconomics(price, costs, shop);
    body.querySelector("#margin-breakdown").innerHTML = costTable([
      ["Selling price", money(price)], ["Average discount", `-${whole(u.discount)}`], ["Shipping charged to customer", whole(u.shipping)], ...(costs.gstPct ? [["GST", `-${whole(u.gst)}`]] : []),
      ["Tee cost", `-${whole(u.tee)}`], ["Courier", `-${whole(u.courier)}`], ["Payment and COD fees", `-${whole(u.fee)}`], ["Refused parcel allowance", `-${whole(u.rto)}`], ...(u.ads ? [["Ads", `-${whole(u.ads)}`]] : []),
      ["Profit per delivered order", whole(u.profit), true], ["Margin", percent(u.marginPct), true],
    ]);

    const steps = [-200, -100, -50, 0, 50, 100, 200].map((d) => price + d).filter((p) => p > 0);
    body.querySelector("#price-steps").innerHTML = costTable(steps.map((p) => {
      const r = unitEconomics(p, costs, shop);
      return [money(p), `${whole(r.profit)} (${percent(r.marginPct)})`, p === price];
    }));
    body.querySelector("#refusal-steps").innerHTML = costTable([0, 5, 10, 15, 20, 30, 40].map((rate) => {
      const r = unitEconomics(price, { ...costs, rtoPct: rate }, shop);
      return [`${rate}% refused`, `${whole(r.profit)} (${percent(r.marginPct)})`, rate === costs.rtoPct];
    }));

    body.querySelector("#product-margins").innerHTML = `<table class="size-table"><thead><tr><th>Product</th><th>Price</th><th>Tee cost</th><th>Profit</th><th>Margin</th><th>Suggested</th></tr></thead><tbody>${products.map((p) => {
      const override = overrideOf(p.id);
      const r = unitEconomics(p.price_inr, costs, shop, override);
      const suggested = suggestPrices(costs, shop, override).suggested;
      return `<tr><th>${esc(p.name)}</th><td>${money(p.price_inr)}</td><td>${whole(teeCost(costs, override))}${override === undefined ? "" : " *"}</td><td>${whole(r.profit)}</td><td class="${r.marginPct < costs.targetPct ? "below" : ""}">${percent(r.marginPct)}${r.marginPct < costs.targetPct ? " Low" : ""}</td><td>${suggested ? money(suggested.price) : "None"}</td></tr>`;
    }).join("")}</tbody></table>${overrides.size ? '<p class="muted small">* Uses this product\'s own cost.</p>' : ""}`;
  };

  refresh();
  form.addEventListener("input", refresh);
  body.querySelector("#check-price").addEventListener("input", refresh);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api.saveCosts(readCosts());
      confirmed = true;
      body.querySelector(".notice-box")?.remove();
      toast("Costs saved");
    } catch (error) {
      toast(error.message, "bad");
    }
  });
}

/** Adds the price suggestion to the product form. */
export async function attachPriceHelp(modal, product) {
  const area = modal.querySelector("#price-help");
  const priceInput = modal.querySelector('[name="price_inr"]');
  const costInput = modal.querySelector('[name="product_cost"]');
  let record;
  let overrides;
  let shop;
  try {
    [record, overrides, shop] = await Promise.all([api.costs(), api.productCosts(), api.settings()]);
  } catch {
    area.innerHTML = '<p class="muted small">Price suggestions are unavailable right now.</p>';
    costInput.disabled = true;
    return () => undefined;
  }
  const costs = withDefaults(record.costs);
  if (product && overrides.has(product.id)) costInput.value = overrides.get(product.id);
  const draw = () => {
    const override = costInput.value === "" ? undefined : Math.max(Number(costInput.value) || 0, 0);
    const s = suggestPrices(costs, shop, override);
    const current = Number(priceInput.value) > 0 ? unitEconomics(Number(priceInput.value), costs, shop, override) : null;
    const choice = (label, option) => (option
      ? `<button type="button" class="price-choice ${label === "Suggested" ? "main" : ""}" data-use="${option.price}"><span>${label}</span><b>${money(option.price)}</b><small>${whole(option.profit)} · ${percent(option.marginPct)}</small></button>`
      : `<div class="price-choice"><span>${label}</span><b>None</b><small>Not reachable</small></div>`);
    area.innerHTML = `<div class="price-choices">${choice("Break-even", s.breakEven)}${choice("Suggested", s.suggested)}${choice("Premium", s.premium)}</div>
      ${current ? `<p class="small ${current.marginPct < costs.targetPct ? "price-low" : "muted"}">At ${money(current.price)}: ${whole(current.profit)} profit per delivered order, ${percent(current.marginPct)} margin${current.marginPct < costs.targetPct ? `, below your ${percent(costs.targetPct)} target` : ""}.</p>` : ""}
      ${record.confirmed ? "" : '<p class="muted small">Based partly on starter estimates. Update your costs in the Margin tab.</p>'}`;
    area.querySelectorAll("[data-use]").forEach((button) => button.addEventListener("click", () => {
      priceInput.value = button.dataset.use;
      draw();
    }));
  };
  draw();
  priceInput.addEventListener("input", draw);
  costInput.addEventListener("input", draw);
  return () => (costInput.value === "" ? null : Math.max(Math.round(Number(costInput.value)) || 0, 0));
}

const IST = "Asia/Kolkata";
const dayKey = (date) => new Date(date).toLocaleDateString("en-CA", { timeZone: IST });
const monthKey = (date) => dayKey(date).slice(0, 7);
const isLost = (o) => ["rejected", "cancelled"].includes(o.status);
const isRefused = (o) => /RTO|RETURN|UNDELIVERED/i.test(o.shipping_status || "");

function tally(list, keyOf, amountOf = () => 1) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyOf(item);
    if (key) map.set(key, (map.get(key) || 0) + amountOf(item));
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

const panelTable = (title, rows, emptyText) => `<section class="panel"><h3>${title}</h3>${rows.length ? costTable(rows) : `<p class="muted small">${emptyText}</p>`}</section>`;

function summarize(orders, costs, costOf) {
  const sold = orders.filter((o) => !isLost(o));
  const lost = orders.filter(isLost);
  const costed = sold.filter((o) => o.status !== "pending");
  const shipped = costed.filter((o) => ["dispatched", "delivered"].includes(o.status));
  const refused = costed.filter(isRefused);
  const kept = costed.filter((o) => !isRefused(o));
  const value = sold.reduce((sum, o) => sum + o.total_inr, 0);
  const units = sold.flatMap((o) => o.order_items).reduce((sum, i) => sum + i.quantity, 0);
  const goods = kept.reduce((sum, o) => sum + o.total_inr - o.shipping_inr, 0);
  const shippingIn = kept.reduce((sum, o) => sum + o.shipping_inr, 0);
  const gst = (goods * costs.gstPct) / (100 + costs.gstPct);
  const tee = costed.flatMap((o) => o.order_items).reduce((sum, i) => sum + i.quantity * costOf(i), 0);
  const courier = shipped.length * costs.courier;
  const returns = refused.length * costs.returnCourier;
  const fees = (kept.reduce((sum, o) => sum + o.total_inr, 0) * costs.feePct) / 100;
  const ads = costed.length * costs.adCost;
  const profit = goods - gst + shippingIn - tee - courier - returns - fees - ads;
  return { sold, lost, costed, shipped, refused, value, units, goods, gst, shippingIn, tee, courier, returns, fees, ads, profit, delivered: orders.filter((o) => o.status === "delivered").length };
}

function buckets(orders, days) {
  const monthly = !days;
  const keyOf = monthly ? monthKey : dayKey;
  const totals = new Map();
  orders.filter((o) => !isLost(o)).forEach((o) => {
    const key = keyOf(o.created_at);
    const row = totals.get(key) || { value: 0, orders: 0 };
    row.value += o.total_inr;
    row.orders += 1;
    totals.set(key, row);
  });
  const keys = [];
  if (monthly) {
    keys.push(...[...totals.keys()].sort());
  } else {
    for (let i = days - 1; i >= 0; i -= 1) keys.push(dayKey(Date.now() - i * 86400000));
  }
  const label = (key) => (monthly
    ? new Date(`${key}-01T12:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
    : new Date(`${key}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }));
  return keys.map((key) => ({ key, label: label(key), ...(totals.get(key) || { value: 0, orders: 0 }) }));
}

function chartHtml(rows) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const edge = rows.length > 1 ? rows[rows.length - 1].label : "";
  return `<div class="chart">
    <div class="chart-area">
      <span class="chart-max mono">${whole(max)}</span>
      <div class="chart-plot" id="sales-plot">${rows.map((r, i) => `<button type="button" class="bar-col" data-i="${i}" aria-label="${esc(r.label)}: ${whole(r.value)}, ${r.orders} order${r.orders === 1 ? "" : "s"}"><i style="height:${r.value ? Math.max((r.value / max) * 100, 2) : 0}%"></i></button>`).join("")}</div>
      <div class="chart-tip" id="sales-tip" hidden></div>
    </div>
    <div class="chart-x mono"><span>${esc(rows[0]?.label || "")}</span><span>${esc(edge)}</span></div>
  </div>
  <details class="chart-table"><summary>View as table</summary><div class="size-table-wrap"><table class="size-table"><thead><tr><th>Date</th><th>Order value</th><th>Orders</th></tr></thead><tbody>${rows.filter((r) => r.orders).reverse().map((r) => `<tr><th>${esc(r.label)}</th><td>${whole(r.value)}</td><td>${r.orders}</td></tr>`).join("") || '<tr><td colspan="3">No orders in this period.</td></tr>'}</tbody></table></div></details>`;
}

function bindChart(body, rows) {
  const plot = body.querySelector("#sales-plot");
  const tip = body.querySelector("#sales-tip");
  if (!plot) return;
  const show = (button) => {
    const row = rows[Number(button.dataset.i)];
    tip.textContent = `${row.label}: ${whole(row.value)} · ${row.orders} order${row.orders === 1 ? "" : "s"}`;
    tip.hidden = false;
    const box = button.getBoundingClientRect();
    const area = plot.parentElement.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(box.left - area.left + box.width / 2, half), area.width - half)}px`;
  };
  const hide = () => { tip.hidden = true; };
  plot.addEventListener("mouseover", (event) => { const b = event.target.closest(".bar-col"); if (b) show(b); });
  plot.addEventListener("focusin", (event) => { const b = event.target.closest(".bar-col"); if (b) show(b); });
  plot.addEventListener("click", (event) => { const b = event.target.closest(".bar-col"); if (b) show(b); });
  plot.addEventListener("mouseleave", hide);
  plot.addEventListener("focusout", hide);
}

export async function drawAnalytics(body, ctx) {
  const [allOrders, record, overrides] = await Promise.all([api.reportOrders(), api.costs(), api.productCosts()]);
  const costs = withDefaults(record.costs);
  const costOf = (item) => teeCost(costs, overrides.has(item.product_id) ? overrides.get(item.product_id) : undefined);
  const periods = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "All time"]];
  const paymentNames = { cod: "Cash on delivery", prepaid: "Full UPI", advance: "UPI advance" };
  const collections = new Map(ctx.store.products.map((p) => [p.id, p.collection]));

  const draw = (days) => {
    const now = Date.now();
    const span = days * 86400000;
    const orders = allOrders.filter((o) => !days || new Date(o.created_at).getTime() >= now - span);
    const earlier = days ? allOrders.filter((o) => { const t = new Date(o.created_at).getTime(); return t >= now - 2 * span && t < now - span; }) : [];
    const a = summarize(orders, costs, costOf);
    const b = summarize(earlier, costs, costOf);
    const change = (current, previous) => {
      if (!days || !previous) return "";
      const delta = Math.round(((current - previous) / previous) * 100);
      return `<small class="muted">${delta >= 0 ? "Up" : "Down"} ${Math.abs(delta)}% vs previous</small>`;
    };
    const average = (s) => (s.sold.length ? s.value / s.sold.length : 0);
    const tile = (label, text, extra = "") => `<div class="stat"><span class="mono muted">${label}</span><strong>${text}</strong>${extra}</div>`;

    const customers = tally(a.sold, (o) => o.user_id);
    const repeat = customers.filter(([, n]) => n > 1).length;
    const reached = [["Placed", orders.length], ["Accepted", orders.filter((o) => ["accepted", "printing", "dispatched", "delivered"].includes(o.status)).length], ["Printing", orders.filter((o) => ["printing", "dispatched", "delivered"].includes(o.status)).length], ["Dispatched", orders.filter((o) => ["dispatched", "delivered"].includes(o.status)).length], ["Delivered", a.delivered]];
    const items = a.sold.flatMap((o) => o.order_items);
    const byProduct = new Map();
    items.forEach((i) => {
      const row = byProduct.get(i.name) || { units: 0, revenue: 0, margin: 0 };
      row.units += i.quantity;
      row.revenue += i.unit_price_inr * i.quantity;
      row.margin += (i.unit_price_inr - costOf(i)) * i.quantity;
      byProduct.set(i.name, row);
    });
    const productRows = [...byProduct.entries()].sort((x, y) => y[1].revenue - x[1].revenue).slice(0, 12);
    const refusalRate = a.shipped.length ? (a.refused.length / a.shipped.length) * 100 : 0;
    const cancelRate = orders.length ? (a.lost.length / orders.length) * 100 : 0;
    const weekdays = tally(a.sold, (o) => new Date(o.created_at).toLocaleDateString("en-IN", { weekday: "long", timeZone: IST }));
    const rows = buckets(orders, days);

    body.innerHTML = `<div class="chips">${periods.map(([d, label]) => `<button class="chip ${d === days ? "on" : ""}" data-days="${d}">${label}</button>`).join("")}</div>
      ${record.confirmed ? "" : '<p class="notice-box">Profit figures include starter cost estimates. Update them in the Margin tab.</p>'}
      <div class="stats">
        ${tile("Order value", whole(a.value), change(a.value, b.value))}
        ${tile("Estimated profit", whole(a.profit), change(a.profit, b.profit))}
        ${tile("Orders", a.sold.length, change(a.sold.length, b.sold.length))}
        ${tile("Average order", whole(average(a)), change(average(a), average(b)))}
        ${tile("Tees sold", a.units, change(a.units, b.units))}
        ${tile("Cancelled or declined", percent(cancelRate))}
        ${tile("Refused or returned", percent(refusalRate))}
        ${tile("Repeat customers", `${repeat} of ${customers.length}`)}
      </div>
      <section class="panel chart-panel"><h3>Order value over time</h3>${chartHtml(rows)}</section>
      <div class="report-grid">
        <section class="panel"><h3>Estimated profit and loss</h3>${costTable([
          ["Tee sales after discounts", whole(a.goods)], ["Shipping charged", whole(a.shippingIn)], ...(a.gst ? [["GST", `-${whole(a.gst)}`]] : []),
          ["Tee costs", `-${whole(a.tee)}`], ["Courier", `-${whole(a.courier)}`], ["Return courier", `-${whole(a.returns)}`], ["Payment and COD fees", `-${whole(a.fees)}`], ...(a.ads ? [["Ads", `-${whole(a.ads)}`]] : []),
          ["Estimated profit", whole(a.profit), true],
        ])}</section>
        ${panelTable("Order progress", reached.map(([k, n]) => [k, String(n)]), "No orders in this period.")}
        <section class="panel"><h3>Products</h3>${productRows.length ? `<div class="size-table-wrap"><table class="size-table"><thead><tr><th>Product</th><th>Sold</th><th>Sales</th><th>Margin</th></tr></thead><tbody>${productRows.map(([name, r]) => `<tr><th>${esc(name)}</th><td>${r.units}</td><td>${whole(r.revenue)}</td><td>${whole(r.margin)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted small">No sales in this period.</p>'}</section>
        ${panelTable("Collections", tally(items, (i) => collections.get(i.product_id) || "Other", (i) => i.unit_price_inr * i.quantity).map(([k, n]) => [k, whole(n)]), "No sales in this period.")}
        ${panelTable("Sizes sold", tally(items, (i) => i.size, (i) => i.quantity).map(([k, n]) => [k, `${n} sold`]), "No sales in this period.")}
        ${panelTable("Top cities", tally(a.sold, (o) => o.city.trim()).slice(0, 10).map(([k, n]) => [k, `${n} order${n === 1 ? "" : "s"}`]), "No orders in this period.")}
        ${panelTable("Top states", tally(a.sold, (o) => o.state.trim()).slice(0, 10).map(([k, n]) => [k, `${n} order${n === 1 ? "" : "s"}`]), "No orders in this period.")}
        ${panelTable("Payment type", tally(a.sold, (o) => paymentNames[o.payment_method]).map(([k, n]) => [k, `${n} order${n === 1 ? "" : "s"}`]), "No orders in this period.")}
        ${panelTable("Busiest days", weekdays.map(([k, n]) => [k, `${n} order${n === 1 ? "" : "s"}`]), "No orders in this period.")}
        ${panelTable("Why orders were lost", tally(a.lost, (o) => o.cancel_reason || "No reason recorded").map(([k, n]) => [k, String(n)]), "No lost orders in this period.")}
        ${panelTable("Coupons", tally(a.sold, (o) => o.coupon_code, (o) => o.coupon_discount_inr).map(([k, n]) => [k, `${whole(n)} given`]), "No coupons used in this period.")}
      </div>
      <p class="muted small">Profit is estimated from your Margin tab costs, counts only accepted orders, and uses your average courier cost rather than each real courier charge. Visitor numbers and conversion rate aren't tracked yet.</p>`;
    body.querySelectorAll("[data-days]").forEach((button) => button.addEventListener("click", () => draw(Number(button.dataset.days))));
    bindChart(body, rows);
  };
  draw(30);
}
