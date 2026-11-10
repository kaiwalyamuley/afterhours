// Owner tab for the earned membership tiers.
import { api } from "./api.js";
import { esc, money, toast } from "./ui.js";
import { withDefaults, unitEconomics } from "./margin.js";

const isRefused = (o) => /RTO|RETURN|UNDELIVERED/i.test(o.shipping_status || "");

function commonPrice(products) {
  const counts = new Map();
  products.filter((p) => p.status === "live").forEach((p) => counts.set(p.price_inr, (counts.get(p.price_inr) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 899;
}

const tierFields = (t) => `
  <label class="field"><span>Name</span><input name="name" required maxlength="30" value="${esc(t.name)}"></label>
  <label class="field"><span>Delivered orders needed</span><input name="min_orders" type="number" min="1" max="1000" step="1" required value="${t.min_orders}"></label>
  <label class="field"><span>Discount (%)</span><input name="discount_pct" type="number" min="1" max="30" step="1" required value="${t.discount_pct}"></label>`;

const readTier = (form) => ({
  name: form.elements.name.value.trim(),
  min_orders: Number(form.elements.min_orders.value),
  discount_pct: Number(form.elements.discount_pct.value),
});

export async function drawMembers(body, ctx) {
  const [tiers, orders, record] = await Promise.all([api.tiers(), api.reportOrders(), api.costs()]);
  const costs = withDefaults(record.costs);
  const shop = ctx.store.settings;
  const active = tiers.filter((t) => t.active).sort((a, b) => b.min_orders - a.min_orders);

  const delivered = new Map();
  orders.filter((o) => o.status === "delivered" && !isRefused(o)).forEach((o) => delivered.set(o.user_id, (delivered.get(o.user_id) || 0) + 1));
  const tierOf = (count) => active.find((t) => t.min_orders <= count);
  const perTier = new Map();
  delivered.forEach((count) => {
    const tier = tierOf(count);
    if (tier) perTier.set(tier.id, (perTier.get(tier.id) || 0) + 1);
  });
  const members = [...perTier.values()].reduce((sum, n) => sum + n, 0);
  const memberOrders = orders.filter((o) => o.member_tier && !["rejected", "cancelled"].includes(o.status));
  const given = memberOrders.reduce((sum, o) => sum + o.member_discount_inr, 0);
  const buyers = delivered.size;
  const repeat = [...delivered.values()].filter((n) => n > 1).length;

  const tile = (label, value) => `<div class="stat"><span class="mono muted">${label}</span><strong>${value}</strong></div>`;
  body.innerHTML = `<div class="stats">
      ${tile("Members", members)}
      ${tile("Customers with 2+ deliveries", buyers ? `${repeat} of ${buyers}` : "0")}
      ${tile("Member orders", memberOrders.length)}
      ${tile("Member discounts given", money(given))}
    </div>
    <p class="notice-box">Customers join automatically when enough orders are delivered. Cancelled, declined and refused orders don't count. A member discount never combines with a coupon, because the bigger saving is used. Your full UPI discount still applies on top.</p>
    <section class="panel">
      <div class="row-between"><h3>Tiers</h3><label class="field tier-price"><span>Check profit on a tee priced at (₹)</span><input id="tier-price" type="number" min="1" step="1" value="${commonPrice(ctx.store.products)}"></label></div>
      <div class="stack" id="tier-list">${tiers.length ? tiers.map((t) => `<form class="tier-row" data-id="${esc(t.id)}">
        <div class="tier-fields">${tierFields(t)}</div>
        <p class="small" data-profit></p>
        <div class="row">
          <label class="check tier-active"><input type="checkbox" name="active" ${t.active ? "checked" : ""}><span>Active</span></label>
          <span class="muted small">${perTier.get(t.id) || 0} member${perTier.get(t.id) === 1 ? "" : "s"}</span>
          <button class="btn small primary">Save</button>
          <button type="button" class="btn small danger" data-delete>Delete</button>
        </div>
      </form>`).join("") : '<p class="muted small">No tiers yet, so membership is hidden from customers.</p>'}</div>
    </section>
    <form class="panel form" id="tier-add">
      <h3>Add a tier</h3>
      <div class="tier-fields">${tierFields({ name: "", min_orders: "", discount_pct: "" })}</div>
      <button class="btn primary">Add tier</button>
    </form>`;

  const priceInput = body.querySelector("#tier-price");
  const showProfit = (form) => {
    const pct = Number(form.elements.discount_pct.value) || 0;
    const price = Math.max(Number(priceInput.value) || 0, 1);
    const result = unitEconomics(price, { ...costs, discountPct: pct }, shop);
    const line = form.querySelector("[data-profit]");
    line.textContent = `At ${pct}% off a ${money(price)} tee: ${money(Math.round(result.profit))} profit per delivered order, ${Math.round(result.marginPct)}% margin${result.marginPct < costs.targetPct ? `, below your ${Math.round(costs.targetPct)}% target` : ""}.`;
    line.className = `small ${result.marginPct < costs.targetPct ? "price-low" : "muted"}`;
  };
  const rows = [...body.querySelectorAll(".tier-row")];
  const refreshProfit = () => rows.forEach(showProfit);
  refreshProfit();
  priceInput.addEventListener("input", refreshProfit);
  rows.forEach((form) => form.addEventListener("input", () => showProfit(form)));

  // A tier that takes more orders to reach must always be worth more.
  const orderProblem = (id, values) => {
    const others = tiers.filter((t) => t.id !== id && t.active);
    if (others.some((t) => t.min_orders === values.min_orders)) return "Another tier already needs that number of orders.";
    const clash = others.some((t) => (t.min_orders < values.min_orders && t.discount_pct >= values.discount_pct) || (t.min_orders > values.min_orders && t.discount_pct <= values.discount_pct));
    return clash ? "A tier that needs more orders must give a bigger discount." : "";
  };
  const afterChange = async (message) => {
    toast(message);
    await ctx.redraw();
  };

  rows.forEach((form) => {
    const id = form.dataset.id;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = { ...readTier(form), active: form.elements.active.checked };
      const problem = values.active ? orderProblem(id, values) : "";
      if (problem) return toast(problem, "bad");
      try {
        await api.saveTier({ id, ...values });
        await afterChange("Tier saved");
      } catch (error) {
        toast(/duplicate|unique/i.test(error.message) ? "Another tier already needs that number of orders." : error.message, "bad");
      }
    });
    form.querySelector("[data-delete]").addEventListener("click", async () => {
      if (!confirm(`Delete the ${tiers.find((t) => t.id === id).name} tier? Customers lose this discount on future orders.`)) return;
      try {
        await api.deleteTier(id);
        await afterChange("Tier deleted");
      } catch (error) {
        toast(error.message, "bad");
      }
    });
  });

  body.querySelector("#tier-add").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = readTier(event.target);
    const problem = orderProblem(null, values);
    if (problem) return toast(problem, "bad");
    try {
      await api.saveTier({ ...values, active: true });
      await afterChange("Tier added");
    } catch (error) {
      toast(/duplicate|unique/i.test(error.message) ? "Another tier already needs that number of orders." : error.message, "bad");
    }
  });
}
