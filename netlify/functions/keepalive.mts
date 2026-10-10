import type { HandlerResponse } from "@netlify/functions";
import { getDb } from "../../src/db/client";

// A lightweight read keeps the Supabase project active without changing data.
// Replaces the Drizzle sql`select 1` with a supabase-js HTTP request so no
// persistent TCP socket is opened. Relative imports only — Netlify esbuild.
export const config = { schedule: "*/5 * * * *" };

export default async (): Promise<HandlerResponse> => {
  try {
    const { error } = await getDb().from("courts").select("id").limit(1);
    if (error) throw error;
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    console.error("Supabase keepalive failed", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false }),
    };
  }
};
