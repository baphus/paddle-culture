import type { HandlerResponse } from "@netlify/functions";

// STUB ONLY (scaffold lane): the real email-outbox worker lands in a later
// lane (ADR-05). This stub only proves scheduled-function bundling.
export const config = { schedule: "*/5 * * * *" };

export default async (): Promise<HandlerResponse> => {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, stub: "keepalive" }),
  };
};
