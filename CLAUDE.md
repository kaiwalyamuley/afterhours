# CLAUDE.md

## What this is
The AfterHours Streetwear Co. store: graphic tees printed to order. A static site (plain HTML, CSS and ES-module JavaScript, no build step, no package.json) served by GitHub Pages on the custom domain in `CNAME` (`wearafterhours.store`). `.nojekyll` keeps Pages from processing files.

## Layout
- `index.html` – customer storefront; loads `js/app.js`.
- `owner.html` – owner console (noindex); loads `js/owner-app.js`.
- `privacy.html` – privacy policy (static).
- `css/app.css` – all styles.
- `assets/` – `brand/`, `lookbook/`, `models/`, `prints/`, `print-files/`.
- `js/`
  - `config.js` – public settings: `SUPABASE_URL`, `SUPABASE_KEY` (publishable key), `INSTAGRAM_URL`.
  - `api.js` – the single data layer; every Supabase call goes through it.
  - `app.js` – storefront (bag in `localStorage`, checkout, orders, reviews).
  - `owner-app.js`, `owner.js` – owner console shell and order pipeline; `analytics.js`, `margin.js`, `products-manager.js`, `product-form.js`, `pages.js`, `members.js` are its tabs.
  - Shared: `ui.js` (helpers, modals, toasts), `motion.js`, `side.js`, `home-layout.js`, `reasons.js`.

## Supabase
- Project ref `qrcatzvlfitidakbsujy` (`https://qrcatzvlfitidakbsujy.supabase.co`); config in `js/config.js`.
- supabase-js v2 loaded from jsDelivr inside `api.js`; auth is Google OAuth (PKCE).
- Tables: `profiles`, `products`, `orders`/`order_items`, `product_reviews`, `store_settings`, `coupons`, `support_messages`, `membership_tiers`, `business_costs`, `product_costs`, `co_owners`. RPC `my_access`; edge function `ship-order`; storage bucket `product-media`.
- Only the publishable key belongs in the repo; access control lives in the database's RLS rules. Never commit a secret/service-role key.

## Preview locally
```sh
python3 -m http.server 8000   # from the repo root
```
Open `http://localhost:8000/` (store) or `http://localhost:8000/owner.html`. This talks to the live Supabase project. Practice mode (`?demo=1`, localhost only) imports `js/demo.js`, which is intentionally not in the published repo, so it only works if you have that file locally.
