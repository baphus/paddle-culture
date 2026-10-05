import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

// postgres.js client is created lazily so `npm run build` succeeds with
// missing env. Runtime uses the pooler (6543, Supabase Session/Transaction
// pooling); DIRECT_DATABASE_URL is for migrations only. `prepare: false`
// is required for the pooler (pooling does not support prepared statements).
let db: Db | null = null;

export function getDb(): Db {
  if (db) return db;
  const poolerUrl = process.env.DATABASE_POOLER_URL ?? process.env.DATABASE_URL;
  if (!poolerUrl) throw new Error("NOT_CONFIGURED");
  if (poolerUrl.includes(":5432")) {
    console.warn(
      "[db] runtime using :5432 direct connection — switch DATABASE_URL/DATABASE_POOLER_URL to pooler :6543; direct is migrations-only",
    );
  }
  const client = postgres(poolerUrl, { prepare: false, max: 1 });
  db = drizzle(client, { schema });
  return db;
}
