import type { HandlerResponse } from "@netlify/functions";
import { processOutboxBatch } from "../../src/lib/mail/worker";

// Email-outbox worker (ADR-05): every 5 minutes, claims up to 50 due outbox
// rows (FOR UPDATE SKIP LOCKED) and sends them over one shared Gmail
// transport. Node runtime only — no edge. Secrets (DATABASE_URL, GMAIL_*)
// come from Netlify env, never from code.
export const config = { schedule: "*/5 * * * *" };

export default async (): Promise<HandlerResponse> => {
  try {
    const result = await processOutboxBatch();
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ...result }),
    };
  } catch (e) {
    console.error("outbox worker failed", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false }),
    };
  }
};
