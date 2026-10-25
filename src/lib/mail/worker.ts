import type { Transporter } from "nodemailer";
import { getDb, type Db } from "../../db/client";
import { OWNER_ALERT_EMAIL } from "../booking/constants";
import { renderOutboxEmail } from "./templates";
import { fromAddress, getSharedTransport } from "./transport";

// Outbox worker (ADR-05). Replaces the Drizzle FOR UPDATE SKIP LOCKED raw
// SQL path with a Postgres RPC (rpc_claim_outbox_batch) that runs the same
// atomic claim server-side. Status updates use plain supabase-js .update()
// calls. Relative imports only.

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

async function claimBatch(db: Db, bookingId?: string): Promise<ClaimedRow[]> {
  if (bookingId) {
    // Two-arg call so the inline submit drain claims only this booking's
    // rows. If the deployed SQL is older than this code (p_booking_id does
    // not exist yet), PostgREST answers PGRST202 — fall through to the
    // unfiltered claim rather than failing the customer's submit.
    const scoped = await db.rpc("rpc_claim_outbox_batch", {
      p_limit: OUTBOX_CLAIM_LIMIT,
      p_booking_id: bookingId,
    });
    const missingFn =
      scoped.error?.code === "PGRST202" ||
      /could not find the function|does not exist/i.test(
        scoped.error?.message ?? "",
      );
    if (!missingFn) {
      if (scoped.error)
        throw new Error(`claimBatch RPC failed: ${scoped.error.message}`);
      return (scoped.data ?? []) as ClaimedRow[];
    }
    console.warn(
      "rpc_claim_outbox_batch has no p_booking_id yet; re-run supabase/rpc-functions.sql to stop draining other bookings' mail inline",
    );
  }
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

// ADR-05 Gmail taxonomy.
function classifyFailure(err: unknown): Verdict {
  const e = (err ?? {}) as SmtpFailure;
  const response = typeof e.response === "string" ? e.response : "";
  // 5.4.5 is Gmail's rate-limit response — throttle for an hour and back off.
  if (/5\.4\.5/.test(response)) return "rate_limit";
  const code =
    typeof e.responseCode === "number" ? e.responseCode : undefined;
  if (code === 535 || code === 534 || code === 553) return "dead";
  if (code === 550 && /5\.7\./.test(response)) return "dead";
  if (e.code === "EAUTH") return "dead";
  // 421 (service not available / connection dropped) is a genuine transient
  // outage — normal exponential backoff, no owner alert.
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

type AlertFn = (subject: string, body: string) => Promise<void>;

async function processRow(
  db: Db,
  transport: Transporter,
  from: string,
  alert: AlertFn,
  row: ClaimedRow,
): Promise<"sent" | "retried" | "failed"> {
  let rendered;
  try {
    rendered = await renderOutboxEmail(row.template, row.payload);
  } catch {
    await markFailed(db, row.id, null);
    await alert(
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
      attachments: rendered.attachments,
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
      await alert(
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
      // Alert on the *first* throttle, not only after 8 retries dead-letter:
      // a sustained Gmail rate limit delays customer confirmations by hours,
      // and the owner needs to know now, not when the row finally fails.
      await alert(
        "Gmail is rate-limiting outgoing mail (5.4.5)",
        `Outbox row ${row.id} to ${row.to_addr} (template ${row.template}) hit a Gmail rate limit (5.4.5) and was pushed back an hour. Confirmation emails will be delayed until the throttle clears. Consider spacing out sends or checking the Gmail account's sending limits. Last error: ${String(e)}`,
      );
      return "retried";
    }
    if (row.attempts >= OUTBOX_MAX_ATTEMPTS) {
      await markFailed(db, row.id, null);
      await alert(
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

export async function processOutboxBatch(
  db?: Db,
  bookingId?: string,
): Promise<BatchResult> {
  const database = db ?? getDb();
  const transport = getSharedTransport();
  const from = fromAddress();
  const rows = await claimBatch(database, bookingId);
  const result: BatchResult = { claimed: rows.length, sent: 0, retried: 0, failed: 0 };

  // One owner alert per batch: if Gmail auth dies, every row in the batch
  // dead-letters at once and one email naming the first failure beats 50
  // identical ones. The dump of which rows failed goes to the log below.
  let alerted = false;
  const alert: AlertFn = async (subject, body) => {
    if (alerted) return;
    alerted = true;
    await alertOwner(transport, from, subject, body);
  };

  for (const row of rows) {
    try {
      const outcome = await processRow(database, transport, from, alert, row);
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

/**
 * Drain only `bookingId`'s rows, best effort. Use this on the inline path
 * after a booking commits: the customer's own 2 rows are what must go out
 * before we answer, and claiming anything else makes them wait behind other
 * people's mail. Anything left behind is picked up by the backstop cron.
 */
export async function drainBookingOutboxBestEffort(
  bookingId: string,
): Promise<void> {
  try {
    await processOutboxBatch(undefined, bookingId);
  } catch (e) {
    console.error("immediate outbox drain failed (cron will retry)", e);
  }
}

/**
 * Drain with a hard deadline, for the submit path. `after()` gives no signal
 * back to the request, so the confirmation screen shows before any mail is
 * confirmed sent. Awaiting a bounded drain lets the common case (Gmail healthy)
 * actually deliver before we return, while a slow/broken mailer still can't
 * hold the request past `timeoutMs` — the cron backstop finishes the rest.
 * Never throws; returns whether every claimed row was handled in time.
 */
export async function drainOutboxWithin(
  timeoutMs: number,
  bookingId?: string,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const drain = (
      bookingId
        ? drainBookingOutboxBestEffort(bookingId)
        : drainOutboxBestEffort()
    ).then(() => "done" as const);
    const winner = await Promise.race([drain, timeout]);
    return winner === "done";
  } catch (e) {
    console.error("bounded outbox drain failed (cron will retry)", e);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
