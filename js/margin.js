// Pricing maths for one delivered tee. No page code here, so it can be tested alone.

export const DEFAULT_COSTS = {
  blank: 220, print: 150, packing: 20, courier: 75, returnCourier: 75,
  rtoPct: 15, feePct: 2, adCost: 0, discountPct: 5, targetPct: 35, premiumPct: 50, gstPct: 0,
};

export const withDefaults = (costs) => ({ ...DEFAULT_COSTS, ...(costs || {}) });
export const teeCost = (costs, override) => (override ?? costs.blank + costs.print + costs.packing);

const shippingFor = (received, shop) => (received >= shop.free_shipping_over ? 0 : Number(shop.shipping_inr || 0));

/** Average expected result per delivered order at a selling price. */
export function unitEconomics(price, costs, shop, override) {
  const tee = teeCost(costs, override);
  const discount = (price * costs.discountPct) / 100;
  const received = price - discount;
  const shipping = shippingFor(received, shop);
  const gst = (received * costs.gstPct) / (100 + costs.gstPct);
  const net = received - gst;
  const fee = ((received + shipping) * costs.feePct) / 100;
  const rate = Math.min(costs.rtoPct, 90) / 100;
  const rto = (rate / (1 - rate)) * (tee + costs.courier + costs.returnCourier);
  const totalCost = tee + costs.courier + fee + rto + costs.adCost;
  const profit = net + shipping - totalCost;
  return { price, discount, received, shipping, gst, net, tee, courier: costs.courier, fee, rto, ads: costs.adCost, totalCost, profit, marginPct: net > 0 ? (profit / net) * 100 : 0 };
}

const friendlyPrice = (value) => Math.ceil((value + 1) / 50) * 50 - 1;

function priceForMargin(margin, costs, shop, override) {
  const rate = Math.min(costs.rtoPct, 90) / 100;
  const tee = teeCost(costs, override);
  const fixed = tee + costs.courier + costs.adCost + (rate / (1 - rate)) * (tee + costs.courier + costs.returnCourier);
  const fee = costs.feePct / 100;
  const keep = (1 - costs.discountPct / 100) * ((1 - margin / 100) / (1 + costs.gstPct / 100) - fee);
  if (keep <= 0) return null;
  const solve = (shipping) => (fixed - shipping * (1 - fee)) / keep;
  const charged = solve(Number(shop.shipping_inr || 0));
  const qualifiesFree = charged * (1 - costs.discountPct / 100) >= shop.free_shipping_over;
  return Math.max(qualifiesFree ? solve(0) : charged, 1);
}

/** Prices rounded up to friendly ...49 or ...99 endings, so each meets its margin. */
export function suggestPrices(costs, shop, override) {
  const make = (margin) => {
    const exact = priceForMargin(margin, costs, shop, override);
    if (exact === null) return null;
    let price = friendlyPrice(exact);
    let guard = 0;
    while (unitEconomics(price, costs, shop, override).marginPct < margin - 0.001 && guard < 200) {
      price += 50;
      guard += 1;
    }
    return { price, ...unitEconomics(price, costs, shop, override) };
  };
  return { breakEven: make(0), suggested: make(costs.targetPct), premium: make(costs.premiumPct) };
}
