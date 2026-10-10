import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase service-role client — replaces the Drizzle/postgres.js TCP pool.
//
// Previously this module held a postgres.js connection pool (prepare:false,
// max:1, connect_timeout:10) wrapped in Drizzle ORM. That persistent TCP
// socket caused Vercel 504s during serverless freeze/thaw cycles because the
// pooler connection was held open across invocations.
//
// The replacement is the @supabase/supabase-js HTTP client using the service
// role key. Every call is a stateless HTTPS request to the Supabase Data API,
// so there are no open sockets between requests. Row-Level Security is
// bypassed by the service role key; access control is enforced at the
// application layer (requireAdmin, CRON_SECRET, etc.) exactly as before.
//
// Transactional paths (submit, approve/reject, outbox claim) are implemented
// as Postgres functions called via supabase.rpc() — they run atomically
// server-side with the same isolation and locking semantics as before.
// ---------------------------------------------------------------------------

export type Db = SupabaseClient;

let _client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NOT_CONFIGURED");
  _client = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _client;
}
