// Outbox drain — manual/maintenance sends (run: `npx tsx scripts/drain-outbox.ts`).
//
// Claims up to 50 due email_outbox rows (same FOR UPDATE SKIP LOCKED code path
// as the */5 Netlify cron and the POST /api/admin/outbox/process admin
// trigger) and sends them over the configured SMTP transport (Mailpit locally
// via SMTP_HOST, Gmail in prod). Prints the { claimed, sent, retried, failed }
// batch result as JSON.
//
// Normally unneeded: submit/approve/reject routes already drain best-effort
// immediately after commit. Reach for this when mail didn't go out (e.g. the
// dev server was down, SMTP was misconfigured, or rows are stuck in retry).
//
// Env: hand-parses .env (quotes stripped, no expansion — same as
// scripts/seed-production.mjs); real environment values win over .env.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { processOutboxBatch } from "../src/lib/mail/worker";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    const value = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnv(join(root, ".env"));
  const result = await processOutboxBatch();
  console.log(JSON.stringify(result));
}

main().catch((e) => {
  console.error("drain-outbox failed: " + String(e));
  process.exit(1);
});
