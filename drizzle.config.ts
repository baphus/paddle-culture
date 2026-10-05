import { defineConfig } from "drizzle-kit";

// Migrations / drizzle-kit require a direct (5432) connection; set
// DIRECT_DATABASE_URL to the direct connection string. Falls back to
// DATABASE_URL for backwards compat.
const directUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (directUrl.includes(":6543")) {
  console.warn(
    "[drizzle] migrations using :6543 pooler connection — switch DIRECT_DATABASE_URL to direct :5432; pooler is runtime-only",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Read lazily via env at runtime; drizzle-kit CLI requires the var only
    // when generating/migrating (schema lane).
    url: directUrl,
  },
});
