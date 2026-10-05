// Production seed — LIVE Supabase DB (run: `node scripts/seed-production.mjs`).
//
// Reads + idempotent INSERTs only. NEVER updates or deletes existing rows:
//   1. courts:          if empty → insert 2 active courts ("Court 1","Court 2",
//                      owner can rename in /admin/courts). If non-empty → touch nothing.
//   2. operating_hours: if empty → insert 7 GLOBAL (court_id NULL) rows, one per
//                      weekday, open 06:00 close 03:00 — the frozen 06:00–03:00
//                      daily schedule (ADR-02, evening-correction 18:00). The
//                      close<=open overnight form is exactly what
//                      src/lib/booking/hours.ts:isSlotOpen expects (spill into
//                      the next Manila day); global rows cover current + future
//                      courts. If non-empty → touch nothing.
//   3. pricing_rules:  SELECT count only (expect 6 live rows) — never touched.
//
// DB access: same pattern as the app (postgres-js, DATABASE_POOLER_URL ??
// DATABASE_URL from .env, prepare:false for the Supabase pooler on 6543;
// direct (5432) is migrations-only). Writes a JSON summary to
// scripts/seed-production.result.json on success.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv(join(root, ".env"));
const poolerUrl = env.DATABASE_POOLER_URL ?? env.DATABASE_URL;
if (!poolerUrl) {
  console.error(
    "seed: DATABASE_POOLER_URL (falling back to DATABASE_URL) missing from .env — aborting (no DB touched). Use the pooler :6543 connection; direct :5432 is migrations-only.",
  );
  process.exit(1);
}

const sql = postgres(poolerUrl, { prepare: false, max: 1 });
const summary = { courts: {}, operating_hours: {}, pricing_rules: {} };

try {
  // --- 1. courts -----------------------------------------------------------
  const courts = await sql`SELECT id, name, status FROM courts ORDER BY name`;
  summary.courts.before = courts.length;
  summary.courts.existing = courts.map((c) => ({ name: c.name, status: c.status }));
  if (courts.length === 0) {
    const inserted = await sql`
      INSERT INTO courts (name, status) VALUES ('Court 1', 'active'), ('Court 2', 'active')
      RETURNING id, name, status`;
    summary.courts.inserted = inserted.map((c) => ({ name: c.name, status: c.status }));
  } else {
    summary.courts.inserted = [];
  }
  summary.courts.after = summary.courts.before + summary.courts.inserted.length;

  // --- 2. operating_hours ----------------------------------------------------
  const hours = await sql`SELECT day_of_week, open_time, close_time FROM operating_hours`;
  summary.operating_hours.before = hours.length;
  if (hours.length === 0) {
    // Global rows (court_id NULL), one per weekday 0=Sunday..6=Saturday.
    // time columns accept 'HH:MM'; close 03:00 <= open 06:00 = overnight spill.
    const rows = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day: d,
      open: "06:00",
      close: "03:00",
    }));
    for (const r of rows) {
      await sql`INSERT INTO operating_hours (court_id, day_of_week, open_time, close_time)
                VALUES (NULL, ${r.day}, ${r.open}, ${r.close})`;
    }
    summary.operating_hours.inserted = rows;
  } else {
    summary.operating_hours.inserted = [];
  }
  summary.operating_hours.after =
    summary.operating_hours.before + summary.operating_hours.inserted.length;

  // --- 3. pricing_rules (verify only — NEVER insert/update/delete) -----------
  const pricing = await sql`SELECT count(*)::int AS n FROM pricing_rules`;
  summary.pricing_rules.count = pricing[0].n;
  summary.pricing_rules.touched = false;

  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(
    join(root, "scripts", "seed-production.result.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), ...summary }, null, 2),
  );
} catch (e) {
  console.error("seed FAILED (no further writes attempted):", e?.message ?? e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
