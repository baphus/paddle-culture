import type { HandlerResponse } from "@netlify/functions";
import { sql } from "drizzle-orm";
import { getDb } from "../../src/db/client";

// A read-only database query keeps the Supabase project active without
// changing application data. Netlify runs this on the deployment schedule;
// DATABASE_URL must be configured in Netlify for it to have an effect.
//
// Relative imports only: Netlify bundles scheduled functions with esbuild.
export const config = { schedule: "*/5 * * * *" };

export default async (): Promise<HandlerResponse> => {
  try {
    await getDb().execute(sql`select 1`);

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
