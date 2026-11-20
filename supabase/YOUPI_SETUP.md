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
- Installers in [`gateway/`](../gateway) that set up the gateway on your own PC.

## What you need to do

### 1. Licence
The YOUPI PG repository has no LICENSE file and its `package.json` says `"Commercial"`.
Get written permission from the maintainers (Zenuxs) before you use it for real orders.

### 2. Put wearafterhours.store's DNS on Cloudflare (free)
The tunnel needs Cloudflare to manage the domain's DNS. If it doesn't yet, add the site at
dash.cloudflare.com, copy your existing records (the GitHub Pages ones for the store), and
switch the nameservers at your domain registrar. The store keeps working on GitHub Pages.

### 3. Run the installer on the PC that will stay on
Download the `gateway` folder of this repository to that PC, then run:

**Windows** (PowerShell, not as administrator):
```powershell
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1 -UpiId yourbrand@okaxis
```

**Linux** (Ubuntu or Debian with systemd):
```bash
bash setup-linux.sh yourbrand@okaxis
```

The installer:
- installs Node.js 24, Git and `cloudflared` if they are missing;
- downloads YOUPI PG at the tested version into `youpi-pg` in your home folder;
- writes the AfterHours settings into its `.env`;
- asks you to sign in to Cloudflare once, then creates a tunnel with three addresses:
  `pay.wearafterhours.store` (checkout), `pay-api.wearafterhours.store` (used by the
  Android observer) and `pay-gmail.wearafterhours.store` (Gmail sign-in). The admin panel
  stays private on the PC;
- starts the gateway and tunnel now and after every restart;
- connects the gateway to the store (store name, UPI ID, webhook, new secret and key) and
  prints the four values Supabase needs. They are also saved to
  `youpi-pg/afterhours-secrets.txt`.

It is safe to run again. Keep the PC on and set it never to sleep.

### 4. Add the Supabase secrets
In Supabase, go to Edge Functions → Secrets and add the four values the installer printed:
`YOUPI_API_URL`, `YOUPI_MERCHANT_ID`, `YOUPI_MERCHANT_KEY`, `YOUPI_WEBHOOK_SECRET`.
Then delete `afterhours-secrets.txt`.

### 5. Connect an observer
On the PC, open `http://localhost:6001` and pair the Android observer app on a spare phone
that has your bank SIM (check the APK's SHA-256 against the YOUPI README first), or connect
Gmail. The gateway refuses new UPI sessions until an observer is online; the store then
falls back to the manual form.

### 6. Switch it on
Check that `https://pay.wearafterhours.store/health` shows `UP`. Then go to the owner panel
→ Store info → Payments, tick **Detect UPI payments automatically** and save.

### 7. Test before customers use it
Place a small UPI order yourself and pay it. The order should move to
**Payment being checked** with the UTR filled in and a gateway note. The YOUPI project
suggests staying under about 20 payments a day per receiving account while you trial it.

## Doing it by hand instead

If you set the gateway up yourself, note that **changing the webhook secret resets the
merchant API key**, so create the secret first and the key last.
`gateway/connect-afterhours.mjs` does this in the right order, and can be run on its own
from inside the `youpi-pg` folder: `node connect-afterhours.mjs env --upi yourid@bank`,
then, with the gateway running, `node connect-afterhours.mjs connect --upi yourid@bank`.
