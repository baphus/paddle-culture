import { eq, sql } from "drizzle-orm";
import type { Transporter } from "nodemailer";
import { getDb, type Db } from "../../db/client";
import { emailOutbox } from "../../db/schema";
import { OWNER_ALERT_EMAIL } from "../booking/constants";
import { renderOutboxEmail } from "./templates";
import { fromAddress, getSharedTransport } from "./transport";

// Outbox worker (ADR-05). Reads-only except outbox status updates: claims up
// to 50 due rows with FOR UPDATE SKIP LOCKED (single atomic UPDATE), sends
// them over ONE shared Nodemailer transport, persists message_id, and applies
// the Gmail retry taxonomy. Relative imports only — Netlify bundles this for
// the */5 scheduled function with esbuild.

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
  const rows = (await db.execute(sql`
    UPDATE email_outbox AS o
    SET status = 'sending', attempts = o.attempts + 1
    WHERE o.id IN (
      SELECT id FROM email_outbox
      WHERE status IN ('pending', 'retry')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY next_attempt_at NULLS FIRST
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    )
    RETURNING o.id, o.template, o.to_addr, o.payload, o.attempts, o.booking_id
  `)) as unknown as ClaimedRow[];
  return rows;
}

type Verdict = "transient" | "rate_limit" | "dead";

interface SmtpFailure {
  responseCode?: unknown;
  response?: unknown;
  code?: unknown;
}

// ADR-05 Gmail taxonomy:
//   4xx transient → exponential backoff min(6h, 60s·2^(n-1)) + jitter,
//     8 attempts then failed;
//   550 5.4.5 daily limit → retry in 1h WITHOUT burning an attempt;
//   535/534 auth, 550 5.7.x policy, 553 bad address → dead-letter + alert.
// Anything unrecognized is treated as transient (safe default: retry).
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

// Direct dead-letter alert to the owner (NOT via outbox — that could loop).
// Best-effort: alert failures never fail the batch.
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
    .update(emailOutbox)
    .set({ status: "failed", messageId, nextAttemptAt: null })
    .where(eq(emailOutbox.id, id));
}

async function processRow(
  db: Db,
  transport: Transporter,
  from: string,
  row: ClaimedRow,
): Promise<"sent" | "retried" | "failed"> {
  let rendered;
  try {
    rendered = renderOutboxEmail(row.template, row.payload);
  } catch {
    // Unknown template / unusable payload: data bug, dead-letter at once.
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
      .update(emailOutbox)
      .set({ status: "sent", messageId, nextAttemptAt: null })
      .where(eq(emailOutbox.id, row.id));
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
      // Gmail daily limit: retry in 1h, attempt NOT burned (claim +1 undone).
      await db
        .update(emailOutbox)
        .set({
          status: "retry",
          attempts: Math.max(0, row.attempts - 1),
          nextAttemptAt: new Date(Date.now() + 3600_000),
        })
        .where(eq(emailOutbox.id, row.id));
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
      .update(emailOutbox)
      .set({
        status: "retry",
        nextAttemptAt: new Date(
          Date.now() + backoffSeconds(row.attempts) * 1000,
        ),
      })
      .where(eq(emailOutbox.id, row.id));
    return "retried";
  }
}

/** Claim one batch and send it. Throws only when infra (DB/transport) is down. */
export async function processOutboxBatch(db?: Db): Promise<BatchResult> {
  const database = db ?? getDb();
  const transport = getSharedTransport();
  const from = fromAddress();
  const rows = await claimBatch(database);
  const result: BatchResult = { claimed: rows.length, sent: 0, retried: 0, failed: 0 };
  // Sequential sends over the single shared transport (this scale needs no
  // concurrency, and serial sends stay under Gmail's rate radar).
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

/**
 * Best-effort immediate drain for request handlers (submit, approve/reject):
 * sends whatever is due right now instead of waiting for the 5-minute cron.
 * Never throws — booking/decision commits must never fail because mail is
 * down. The cron + admin trigger remain as backstops (claiming is atomic via
 * FOR UPDATE SKIP LOCKED, so a concurrent cron run can't double-send).
 */
export async function drainOutboxBestEffort(): Promise<void> {
  try {
    await processOutboxBatch();
  } catch (e) {
    console.error("immediate outbox drain failed (cron will retry)", e);
  }
}
