import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Read lazily via env at runtime; drizzle-kit CLI requires the var only
    // when generating/migrating (schema lane).
    url: process.env.DATABASE_URL ?? "",
  },
});
