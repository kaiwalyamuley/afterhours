# Automatic UPI detection with YOUPI PG

AfterHours can use a self-hosted [YOUPI PG](https://github.com/youpi-pg/YouPI-PG) gateway
to spot UPI payments by itself. It stays **off** until you switch it on in the owner panel.

## How it works

1. A customer opens **Pay now** and taps **Pay with any UPI app**.
2. The `youpi-create` function reads the order total from the database (never from the
   browser) and opens a payment session on your gateway. The customer is sent to its QR page.
3. Your gateway sees the bank alert (Android observer phone or Gmail) and sends a signed
   webhook to `youpi-webhook`.
4. On `OBSERVED_SUCCESS` the order gets the UTR and moves to **Payment being checked**,
   just as if the customer had typed the reference. **You still press "Money received"**
   after checking your bank. A bank alert is not proof that the money settled.
5. On `RECONCILED` (you imported a bank statement into the gateway and a line matched)
   the payment is marked received.

If the gateway is down or switched off, customers still see the normal UPI ID and
reference form, so nothing breaks.

## What is already done

- Database: `store_settings.upi_gateway_on`, `orders.gateway_payment_id`,
  `orders.gateway_state`, the `gateway_event` function (callable only by the service role)
  and a delivery log, so a retried webhook is applied only once.
- Edge functions `youpi-create` (sign-in required) and `youpi-webhook` (checks the HMAC
  signature) are deployed. Their source is in this folder.
- Store: the pay page button, the owner panel switch and a gateway note on each order.

## What you need to do

### 1. Licence
The YOUPI PG repository has no LICENSE file and its `package.json` says `"Commercial"`.
Get written permission from the maintainers (Zenuxs) before you use it for real orders.

### 2. A server for the gateway
GitHub Pages cannot run it. Use an always-on Linux machine with **Node 24.22.1 or newer**,
reachable over HTTPS (for example `pay.wearafterhours.store` through a Cloudflare Tunnel).

```bash
git clone https://github.com/youpi-pg/YouPI-PG.git youpi-pg && cd youpi-pg
npm install && cp .env.example .env
```

Set these in the gateway's `.env`:

```ini
CHECKOUT_PUBLIC_URL=https://pay.wearafterhours.store
YOUPI_ALLOWED_ORIGINS=https://wearafterhours.store
YOUPI_ALLOWED_RETURN_ORIGINS=https://wearafterhours.store
DEFAULT_APP_NAME="AfterHours"
DEFAULT_PAYEE_VPA=your-upi-id@bank
DEFAULT_HIDE_POWERED_BY=true
ANDROID_ENROLLMENT_SECRET=<new random 64-hex value>
```

Generate random values with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Start it with `npm start`. Point the public address at the checkout portal (port 7000)
only: it serves the QR pages and forwards `/api/*` to the payment API itself. Keep the
admin panel (6001), control center (8090) and payment API port (6100) private, and back up
`data/`. The admin API is reachable through `/api/v1/admin/*` but needs the admin token
in `data/.secrets/admin_api_token`, so keep that file secret.

### 3. Connect an observer
In the gateway admin panel, pair the Android observer app on a spare phone that has your
bank SIM (check the APK's SHA-256 against the README first), or connect Gmail. The gateway
refuses new UPI sessions until an observer is online; the store then falls back to the
manual form.

### 4. Point the gateway at the store, in this order
In the gateway admin panel, for your merchant:

1. Set the webhook URL to
   `https://qrcatzvlfitidakbsujy.supabase.co/functions/v1/youpi-webhook`.
2. Rotate the **webhook secret** and copy it.
3. **Then** rotate the **merchant API key** and copy it. Changing the webhook secret
   resets the API key, so the key must come last.
4. Copy the merchant ID.

### 5. Add the Supabase secrets
In Supabase, go to Edge Functions → Secrets and add:

| Name | Value |
| --- | --- |
| `YOUPI_API_URL` | your public payment API address, e.g. `https://pay.wearafterhours.store` |
| `YOUPI_MERCHANT_ID` | merchant ID from step 4 |
| `YOUPI_MERCHANT_KEY` | merchant API key from step 4 |
| `YOUPI_WEBHOOK_SECRET` | webhook secret from step 4 |

### 6. Switch it on
Owner panel → Store info → Payments → tick **Detect UPI payments automatically** → Save.

### 7. Test before customers use it
Place a small UPI order yourself and pay it. The order should move to
**Payment being checked** with the UTR filled in and a gateway note. The YOUPI project
suggests staying under about 20 payments a day per receiving account while you trial it.
