import type { Transporter } from "nodemailer";
import { getDb, type Db } from "../../db/client";
import { OWNER_ALERT_EMAIL } from "../booking/constants";
import { renderOutboxEmail } from "./templates";
import { fromAddress, getSharedTransport } from "./transport";

// Outbox worker (ADR-05). Replaces the Drizzle FOR UPDATE SKIP LOCKED raw
// SQL path with a Postgres RPC (rpc_claim_outbox_batch) that runs the same
// atomic claim server-side. Status updates use plain supabase-js .update()
// calls. Relative imports only — Netlify bundles this for esbuild.

export const OUTBOX_CLAIM_LIMIT = 50;
export const OUTBOX_MAX_ATTEMPTS = 8;

interface ClaimedRow {
  id: string;
  template: string;
  to_addr: string;
  payload: Record<string, unknown>;
  attempts: number;
  booking_id: string | null;
}

export interface BatchResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
}

async function claimBatch(db: Db): Promise<ClaimedRow[]> {
  const { data, error } = await db.rpc("rpc_claim_outbox_batch", {
    p_limit: OUTBOX_CLAIM_LIMIT,
  });
  if (error) throw new Error(`claimBatch RPC failed: ${error.message}`);
  return (data ?? []) as ClaimedRow[];
}

type Verdict = "transient" | "rate_limit" | "dead";

interface SmtpFailure {
  responseCode?: unknown;
  response?: unknown;
  code?: unknown;
}

// ADR-05 Gmail taxonomy (unchanged from Drizzle version).
function classifyFailure(err: unknown): Verdict {
  const e = (err ?? {}) as SmtpFailure;
  const response = typeof e.response === "string" ? e.response : "";
  if (/5\.4\.5/.test(response)) return "rate_limit";
  const code =
    typeof e.responseCode === "number" ? e.responseCode : undefined;
  if (code === 535 || code === 534 || code === 553) return "dead";
  if (code === 550 && /5\.7\./.test(response)) return "dead";
  if (e.code === "EAUTH") return "dead";
  return "transient";
}

function backoffSeconds(attempts: number): number {
  const base = Math.min(6 * 3600, 60 * 2 ** Math.max(0, attempts - 1));
  return base + Math.floor(Math.random() * 60);
}

async function alertOwner(
  transport: Transporter,
  from: string,
  subject: string,
  body: string,
): Promise<void> {
  try {
    await transport.sendMail({
      from,
      to: OWNER_ALERT_EMAIL,
      subject: `CK Grounds mailer — ${subject}`,
      text: body,
    });
  } catch (e) {
    console.error("owner alert failed", e);
  }
}

async function markFailed(
  db: Db,
  id: string,
  messageId: string | null,
): Promise<void> {
  await db
    .from("email_outbox")
    .update({ status: "failed", message_id: messageId, next_attempt_at: null })
    .eq("id", id);
}

async function processRow(
  db: Db,
  transport: Transporter,
  from: string,
  row: ClaimedRow,
): Promise<"sent" | "retried" | "failed"> {
  let rendered;
  try {
    rendered = await renderOutboxEmail(row.template, row.payload);
  } catch {
    await markFailed(db, row.id, null);
    await alertOwner(
      transport,
      from,
      "dead-lettered email",
      `Outbox row ${row.id} (template ${row.template}) could not be rendered and was marked failed.`,
    );
    return "failed";
  }

  try {
    const info = (await transport.sendMail({
      from,
      to: row.to_addr,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    })) as { messageId?: unknown };
    const messageId =
      typeof info?.messageId === "string" ? info.messageId : null;
    await db
      .from("email_outbox")
      .update({ status: "sent", message_id: messageId, next_attempt_at: null })
      .eq("id", row.id);
    return "sent";
  } catch (e) {
    const verdict = classifyFailure(e);
    if (verdict === "dead") {
      await markFailed(db, row.id, null);
      await alertOwner(
        transport,
        from,
        "dead-lettered email",
        `Outbox row ${row.id} to ${row.to_addr} (template ${row.template}) dead-lettered. Error: ${String(e)}`,
      );
      return "failed";
    }
    if (verdict === "rate_limit") {
      await db
        .from("email_outbox")
        .update({
          status: "retry",
          attempts: Math.max(0, row.attempts - 1),
          next_attempt_at: new Date(Date.now() + 3600_000).toISOString(),
        })
        .eq("id", row.id);
      return "retried";
    }
    if (row.attempts >= OUTBOX_MAX_ATTEMPTS) {
      await markFailed(db, row.id, null);
      await alertOwner(
        transport,
        from,
        "dead-lettered email",
        `Outbox row ${row.id} to ${row.to_addr} (template ${row.template}) failed after ${row.attempts} attempts. Last error: ${String(e)}`,
      );
      return "failed";
    }
    await db
      .from("email_outbox")
      .update({
        status: "retry",
        next_attempt_at: new Date(
          Date.now() + backoffSeconds(row.attempts) * 1000,
        ).toISOString(),
      })
      .eq("id", row.id);
    return "retried";
  }
}

export async function processOutboxBatch(db?: Db): Promise<BatchResult> {
  const database = db ?? getDb();
  const transport = getSharedTransport();
  const from = fromAddress();
  const rows = await claimBatch(database);
  const result: BatchResult = { claimed: rows.length, sent: 0, retried: 0, failed: 0 };
  for (const row of rows) {
    try {
      const outcome = await processRow(database, transport, from, row);
      result[outcome] += 1;
    } catch (e) {
      console.error(`outbox row ${row.id} crashed the worker loop`, e);
      result.failed += 1;
    }
  }
  return result;
}

export async function drainOutboxBestEffort(): Promise<void> {
  try {
    await processOutboxBatch();
  } catch (e) {
    console.error("immediate outbox drain failed (cron will retry)", e);
  }
}
