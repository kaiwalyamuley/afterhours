#!/usr/bin/env node
// Prepares a YOUPI PG gateway for AfterHours. Run it from inside the youpi-pg folder.
//
//   node connect-afterhours.mjs env --upi yourid@bank [--host pay.wearafterhours.store]
//     Writes the AfterHours settings into .env (creates it from .env.example if missing).
//
//   node connect-afterhours.mjs connect --upi yourid@bank [--gateway http://localhost:6100]
//     Uses the gateway's admin API to set the store name, UPI ID and webhook, creates a
//     fresh webhook secret and merchant key (in that order, because changing the secret
//     can reset the key), and saves the four values Supabase needs to afterhours-secrets.txt.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const WEBHOOK_URL = "https://qrcatzvlfitidakbsujy.supabase.co/functions/v1/youpi-webhook";
const STORE_ORIGIN = "https://wearafterhours.store";

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
const fail = (message) => {
  console.error(`\n[!] ${message}\n`);
  process.exit(1);
};

const upi = (args.upi || "").trim();
if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(upi)) fail("Pass your UPI ID, for example --upi yourbrand@okaxis");
if (!fs.existsSync("package.json") || !fs.existsSync(".env.example")) fail("Run this from inside the youpi-pg folder.");

function writeEnv() {
  const host = (args.host || "pay.wearafterhours.store").trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) fail(`"${host}" is not a valid host name`);
  if (!fs.existsSync(".env")) fs.copyFileSync(".env.example", ".env");
  const values = {
    // Production start-up requires a domain. We run our own tunnel that exposes only the
    // checkout portal, so CLOUDFLARE_TUNNEL_COMMAND stays unset on purpose.
    CLOUDFLARE_DOMAIN: host.split(".").slice(1).join("."),
    CHECKOUT_PUBLIC_URL: `https://${host}`,
    YOUPI_ALLOWED_ORIGINS: STORE_ORIGIN,
    YOUPI_ALLOWED_RETURN_ORIGINS: STORE_ORIGIN,
    CHECKOUT_FRAME_ANCESTORS: STORE_ORIGIN,
    DEFAULT_APP_NAME: '"AfterHours"',
    DEFAULT_MERCHANT_NAME: '"AfterHours"',
    DEFAULT_PAYEE_VPA: `"${upi}"`,
    DEFAULT_HIDE_POWERED_BY: "true",
    WHATSAPP_SENDER_NAME: '"AfterHours"',
  };
  let text = fs.readFileSync(".env", "utf8");
  // The example ships a shared placeholder; replace it once with a private random value.
  if (/^ANDROID_ENROLLMENT_SECRET=android_pairing_enrollment_secret_key_32_chars\s*$/m.test(text)) {
    values.ANDROID_ENROLLMENT_SECRET = crypto.randomBytes(32).toString("hex");
  }
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^#?\\s*${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(".env", text, { mode: 0o600 });
  fs.chmodSync(".env", 0o600); // No effect on Windows, where the user folder is already private.
  console.log(`[ok] .env is set for ${STORE_ORIGIN}, checkout at https://${host}, UPI ${upi}`);
}

async function connect() {
  const gateway = (args.gateway || "http://localhost:6100").replace(/\/+$/, "");
  // The gateway creates its admin token lazily; use its own helper so we read (or create)
  // the very same file the running server will use.
  const { getAdminToken } = await import(pathToFileURL(path.resolve("packages/common/src/secrets.js")).href);
  const token = getAdminToken();
  if (!token) fail("Could not read the gateway's admin token.");

  const call = async (route, body) => {
    const response = await fetch(`${gateway}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body || {}),
    }).catch(() => fail(`Cannot reach the gateway at ${gateway}. Is it running?`));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) fail(`${route} failed (${response.status}): ${data.error || data.message || "no details"}`);
    return data;
  };

  await call("/api/v1/admin/all-settings", { businessName: "AfterHours", upiId: upi, payeeName: "AfterHours", webhookUrl: WEBHOOK_URL });
  console.log(`[ok] Store name, UPI ID and webhook (${WEBHOOK_URL}) saved`);
  const { webhookSecret } = await call("/api/v1/admin/webhook-secret/rotate");
  const { merchantId, merchantKey } = await call("/api/v1/admin/merchant-key/rotate");
  if (!webhookSecret || !merchantId || !merchantKey) fail("The gateway did not return the new keys.");

  const publicUrl = (fs.readFileSync(".env", "utf8").match(/^CHECKOUT_PUBLIC_URL=(.+)$/m) || [])[1]?.trim() || "https://pay.wearafterhours.store";
  const secrets = [
    "Add these in Supabase: Edge Functions > Secrets. Delete this file afterwards.",
    "",
    `YOUPI_API_URL=${publicUrl}`,
    `YOUPI_MERCHANT_ID=${merchantId}`,
    `YOUPI_MERCHANT_KEY=${merchantKey}`,
    `YOUPI_WEBHOOK_SECRET=${webhookSecret}`,
    "",
  ].join("\n");
  fs.writeFileSync("afterhours-secrets.txt", secrets, { mode: 0o600 });
  fs.chmodSync("afterhours-secrets.txt", 0o600);
  console.log(`[ok] New webhook secret and merchant key created`);
  console.log(`\n${secrets}\nSaved to ${path.resolve("afterhours-secrets.txt")}`);
}

if (command === "env") writeEnv();
else if (command === "connect") await connect();
else fail("Use: node connect-afterhours.mjs env|connect --upi yourid@bank");
