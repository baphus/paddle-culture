import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

// postgres.js client is created lazily so `npm run build` succeeds with
// missing env. `prepare: false` is required for the Supabase pooler
// (transaction/session pooling does not support prepared statements).
let db: Db | null = null;

export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("NOT_CONFIGURED");
  const client = postgres(url, { prepare: false, max: 1 });
  db = drizzle(client, { schema });
  return db;
}
