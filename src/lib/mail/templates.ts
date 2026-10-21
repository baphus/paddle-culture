import QRCode from "qrcode";
import { googleCalendarUrlForRange } from "../booking/calendar";
import {
  OUTBOX_TEMPLATE_CUSTOMER_SUBMITTED,
  OUTBOX_TEMPLATE_OWNER_ALERT,
  VENUE_PHONE_DISPLAY,
  VENUE_PHONE_LINK,
} from "../booking/constants";
import { VENUE_ADDRESS } from "../venue";

// Transactional templates (ADR-05). Submit writes the first two; the
// approve/reject decision lane writes the latter two with the payload
// contracts documented below.

export const OUTBOX_TEMPLATE_CUSTOMER_APPROVED = "booking_customer_approved";
export const OUTBOX_TEMPLATE_CUSTOMER_REJECTED = "booking_customer_rejected";

/** Inline (Content-ID) attachment consumed by nodemailer. */
export interface EmailAttachment {
  filename: string;
  cid: string;
  content: Buffer;
  contentType: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
}

type Payload = Record<string, unknown>;

interface SlotSummary {
  courtId?: unknown;
  courtName?: unknown;
  slotStart?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

const SLOT_DURATION_MS = 60 * 60 * 1000; // 1-hour slots

const dateFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return timeFmt.format(d);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

function compactTimeRange(startIso: string, endIso: string): string {
  const start = formatTime(startIso);
  const end = formatTime(endIso);
  const startParts = start.trim().split(" ");
  const endParts = end.trim().split(" ");
  const startMeridiem = startParts.pop();
  const endMeridiem = endParts.pop();
  if (startMeridiem === endMeridiem) {
    return `${startParts.join(" ")} – ${endParts.join(" ")} ${endMeridiem}`;
  }
  return `${start} – ${end}`;
}

// Collapsed slot: consecutive 1-hour blocks on the same court become a range.
interface CourtSession {
  court: string;
  date: string;       // e.g. "Tuesday, October 6, 2026"
  timeRange: string;  // e.g. "7:00 AM – 9:00 AM" or just "9:00 AM – 10:00 AM"
  hours: number;
  /** Machine-readable bounds for the calendar link (display strings stay formatted). */
  startIso: string;
  endIso: string;
}

function collapseSlots(p: Payload): CourtSession[] {
  const raw = Array.isArray(p.slots) ? (p.slots as SlotSummary[]) : [];
  if (!raw.length) return [];

  // Sort by court, then by time.
  const sorted = [...raw].sort((a, b) => {
    const ca = str(a.courtId);
    const cb = str(b.courtId);
    if (ca !== cb) return ca.localeCompare(cb);
    return new Date(str(a.slotStart)).getTime() - new Date(str(b.slotStart)).getTime();
  });

  const sessions: CourtSession[] = [];
  let i = 0;
  while (i < sorted.length) {
    const current = sorted[i]!;
    const courtId = str(current.courtId);
    const courtName = str(current.courtName, str(current.courtId, "Court"));
    const startIso = str(current.slotStart);
    const startMs = new Date(startIso).getTime();
    if (Number.isNaN(startMs)) {
      sessions.push({
        court: courtName,
        date: startIso,
        timeRange: startIso,
        hours: 1,
        startIso,
        endIso: "",
      });
      i++;
      continue;
    }

    // Extend run while same court and consecutive 1-hour slots.
    let endMs = startMs + SLOT_DURATION_MS;
    let j = i + 1;
    while (j < sorted.length) {
      const next = sorted[j]!;
      if (str(next.courtId) !== courtId) break;
      const nextMs = new Date(str(next.slotStart)).getTime();
      if (nextMs !== endMs) break;
      endMs += SLOT_DURATION_MS;
      j++;
    }

    const hours = j - i;
    const endIso = new Date(endMs).toISOString();
    sessions.push({
      court: courtName,
      date: formatDate(startIso),
      timeRange: compactTimeRange(startIso, endIso),
      hours,
      startIso,
      endIso,
    });
    i = j;
  }

  return sessions;
}

interface PriceLine {
  kind?: unknown;
  detail?: unknown;
  amount?: unknown;
  unitAmount?: unknown;
  courtId?: unknown;
}

interface InvoiceLine {
  label: string;
  detail?: string;
  amount: string;
}

// Compact invoice lines from the raw server-calculated pricing lines. Consecutive
// slots with the same court rate share one range; a rate change starts a new line.
function linesOf(
  p: Payload,
  sessions: CourtSession[],
): InvoiceLine[] {
  const raw = Array.isArray(p.lines) ? (p.lines as PriceLine[]) : [];

  // Build a courtId → name lookup from the slots in the payload.
  const courtNameById = new Map<string, string>();
  const rawSlots = Array.isArray(p.slots) ? (p.slots as SlotSummary[]) : [];
  for (const s of rawSlots) {
    const id = str(s.courtId);
    const name = str(s.courtName, str(s.courtId, "Court"));
    if (id) courtNameById.set(id, name);
  }

  const priceByCourtSlot = new Map<string, { amount: string; unitAmount: string }>();
  const otherLines: InvoiceLine[] = [];

  for (const l of raw) {
    const kind = str(l.kind);
    const rawDetail = str(l.detail, "Fee");
    const amount = str(l.amount);
    const unitAmount = str(l.unitAmount, amount);
    const courtId = str(l.courtId ?? "");

    if (kind === "court" && courtId) {
      const marker = rawDetail.lastIndexOf(" @ ");
      const slotStart = marker >= 0 ? rawDetail.slice(marker + 3) : "";
      if (slotStart) priceByCourtSlot.set(`${courtId}|${slotStart}`, { amount: amount || unitAmount, unitAmount });
    } else if (kind === "paddle") {
      otherLines.push({
        label: `Paddle rental · ${rawDetail.replace(/ paddle\(s\) x /, " × ").replace(/h$/, " hours")}`,
        detail: `${unitAmount ? `₱${unitAmount}` : ""} per paddle per hour`,
        amount,
      });
    } else if (kind === "ball") {
      otherLines.push({ label: "Ball set · one booking", amount });
    } else {
      otherLines.push({ label: rawDetail, amount });
    }
  }

  // Approved/rejected payloads don't carry lines — fall back to sessions.
  if (raw.length === 0 && sessions.length > 0) {
    return sessions.map((s) => ({ label: `${s.court} · ${s.hours} hours`, detail: s.timeRange, amount: "" }));
  }

  const slotsByCourt = new Map<string, SlotSummary[]>();
  for (const slot of rawSlots) {
    const id = str(slot.courtId);
    const slots = slotsByCourt.get(id) ?? [];
    slots.push(slot);
    slotsByCourt.set(id, slots);
  }

  const courtLines: InvoiceLine[] = [];
  for (const [courtId, slots] of slotsByCourt) {
    const sorted = [...slots].sort((a, b) => new Date(str(a.slotStart)).getTime() - new Date(str(b.slotStart)).getTime());
    const runs: { unitAmount: string; amount: number; startIso: string; endIso: string; hours: number }[] = [];
    for (const slot of sorted) {
      const startIso = str(slot.slotStart);
      const startMs = new Date(startIso).getTime();
      const price = priceByCourtSlot.get(`${courtId}|${startIso}`);
      const unitAmount = price?.unitAmount ?? "";
      const previous = runs[runs.length - 1];
      if (previous && previous.unitAmount === unitAmount && new Date(previous.endIso).getTime() === startMs) {
        previous.endIso = new Date(startMs + SLOT_DURATION_MS).toISOString();
        previous.hours += 1;
        previous.amount += Number(price?.amount ?? 0);
      } else {
        runs.push({
          unitAmount,
          amount: Number(price?.amount ?? 0),
          startIso,
          endIso: new Date(startMs + SLOT_DURATION_MS).toISOString(),
          hours: 1,
        });
      }
    }
    const courtName = courtNameById.get(courtId) ?? "Court";
    for (const run of runs) {
      courtLines.push({
        label: `${courtName} · ${run.hours} hour${run.hours === 1 ? "" : "s"}`,
        detail: `${compactTimeRange(run.startIso, run.endIso)}${run.unitAmount ? ` · ₱${run.unitAmount}/hour` : ""}`,
        amount: run.amount ? run.amount.toFixed(2).replace(/\.00$/, "") : "",
      });
    }
  }

  return [...courtLines, ...otherLines];
}

function appBase(): string {
  return (process.env.APP_URL || "https://ckgrounds.vercel.app").replace(/\/$/, "");
}

function bookingUrl(token: string): string | null {
  const base = appBase();
  if (!base || !token) return null;
  return `${base}/track/${token}`;
}

function adminUrl(): string {
  return `${appBase()}/admin`;
}

function logoUrl(): string | null {
  const base = appBase();
  if (!base) return null;
  return `${base}/logo.jpg`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Returns a PNG buffer for the QR code, or null if generation fails.
// NOTE: we deliberately do NOT build a base64 `data:` URI. Gmail and Outlook
// strip data-URI <img> sources, which left customers staring at the alt text
// instead of a scannable QR. The PNG is attached inline and referenced by a
// `cid:` URL, which every major client renders.
async function qrPng(url: string): Promise<Buffer | null> {
  try {
    const buf = await QRCode.toBuffer(url, {
      type: "png",
      width: 440,
      margin: 2,
      color: { dark: "#26422a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
    return buf;
  } catch (err) {
    console.error("qr generation failed", err);
    return null;
  }
}

function qrAttachment(buf: Buffer, cid: string): EmailAttachment {
  return {
    filename: "booking-qr.png",
    cid,
    content: buf,
    contentType: "image/png",
  };
}

// ---------------------------------------------------------------------------
// Brand tokens
// ---------------------------------------------------------------------------

const BRAND = {
  flame: "#ea662c",
  pine: "#26422a",
  cream: "#fff8ef",
  oat: "#fff3d4",
  line: "#e8ddc8",
  ink: "#3c3835",
  muted: "#7a7268",
  white: "#ffffff",
  liveGreen: "#2e7d32",
  liveBg: "#eaf5ec",
  errorRed: "#ba1a1a",
  errorBg: "#fce8e6",
};

// ---------------------------------------------------------------------------
// HTML shell (table-based, inline styles, email-client-safe)
// ---------------------------------------------------------------------------

function emailShell(opts: { preheader: string; body: string }): string {
  const logo = logoUrl();
  const logoImg = logo
    ? `<img src="${escapeHtml(logo)}" alt="CK Grounds" width="72" height="72"
         style="display:block;border-radius:8px;border:0;" />`
    : `<span style="font-size:22px;font-weight:700;color:${BRAND.white};">CK Grounds</span>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>CK Grounds</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND.cream};
             font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(opts.preheader)}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color:${BRAND.cream};">
    <tr><td align="center" style="padding:32px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td align="center"
              style="background-color:${BRAND.pine};border-radius:12px 12px 0 0;
                     padding:24px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:14px;vertical-align:middle;">${logoImg}</td>
                <td style="vertical-align:middle;">
                  <p style="margin:0;font-size:21px;font-weight:700;
                             color:${BRAND.white};letter-spacing:-0.3px;">CK Grounds</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:${BRAND.white};padding:36px 40px;
                     border-radius:0 0 12px 12px;">
            ${opts.body}

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="margin-top:32px;">
              <tr>
                <td style="border-top:1px solid ${BRAND.line};padding-top:20px;">
                  <p style="margin:0;font-size:12px;color:${BRAND.muted};line-height:1.6;">
                    This email was sent by the CK Grounds booking system.
                    Do not share your booking link with others.
                  </p>
                  <p style="margin:8px 0 0;font-size:12px;color:${BRAND.muted};line-height:1.6;">
                    Questions? Call or text us at
                    <a href="${VENUE_PHONE_LINK}" style="color:${BRAND.pine};">${VENUE_PHONE_DISPLAY}</a>.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Re-usable HTML blocks
// ---------------------------------------------------------------------------

function sectionLabel(text: string): string {
  return `<p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.8px;
                     text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(text)}</p>`;
}

function sessionsBlock(sessions: CourtSession[]): string {
  if (!sessions.length) return "";
  const rows = sessions
    .map(
      (s) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid ${BRAND.line};">
          <span style="font-size:13px;font-weight:600;color:${BRAND.pine};">
            ${escapeHtml(s.court)}
          </span><br />
          <span style="font-size:13px;color:${BRAND.ink};">
            ${escapeHtml(s.date)}
          </span><br />
          <span style="font-size:13px;color:${BRAND.ink};">
            ${escapeHtml(s.timeRange)}
            <span style="color:${BRAND.muted};">(${s.hours}h)</span>
          </span>
        </td>
      </tr>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid ${BRAND.line};border-radius:8px;margin-bottom:24px;
                  border-collapse:collapse;">
      ${rows}
    </table>`;
}

// Invoice-style pricing table: line items + total row.
// Skips the amount column when amount is empty (approved/rejected fallback rows).
function invoiceBlock(
  lines: InvoiceLine[],
  total: string,
): string {
  if (!lines.length && !total) return "";

  const lineRows = lines
    .map(
      (l) => `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:${BRAND.ink};border-bottom:1px solid ${BRAND.line};">
          <strong style="font-weight:600;">${escapeHtml(l.label)}</strong>
          ${l.detail ? `<br /><span style="font-size:12px;color:${BRAND.muted};">${escapeHtml(l.detail)}</span>` : ""}
        </td>
        <td style="padding:8px 0;font-size:14px;color:${BRAND.ink};border-bottom:1px solid ${BRAND.line};
                   text-align:right;white-space:nowrap;">
          ${l.amount ? `₱${escapeHtml(l.amount)}` : ""}
        </td>
      </tr>`,
    )
    .join("");

  const totalRow = total
    ? `<tr>
        <td style="padding:12px 0 0;font-size:15px;font-weight:700;color:${BRAND.pine};">
          Total
        </td>
        <td style="padding:12px 0 0;font-size:15px;font-weight:700;color:${BRAND.pine};
                   text-align:right;white-space:nowrap;">
          ₱${escapeHtml(total)}
        </td>
      </tr>`
    : "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin-bottom:24px;">
      ${lineRows}
      ${totalRow}
    </table>`;
}

function customerBlock(name: string, email: string, phone: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0"
           style="margin-bottom:24px;width:100%;">
      <tr>
        <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;width:56px;">Name</td>
        <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;font-weight:600;">
          ${escapeHtml(name)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;">Email</td>
        <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;">
          ${escapeHtml(email)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;">Phone</td>
        <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;">
          ${escapeHtml(phone)}</td>
      </tr>
    </table>`;
}

function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:8px;background-color:${BRAND.flame};">
          <a href="${escapeHtml(url)}"
             style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;
                    color:${BRAND.white};text-decoration:none;border-radius:8px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

// Outline button — deliberately quieter than ctaButton() so "Add to calendar"
// never competes with the primary action (QR pass / booking status).
function outlineButton(label: string, url: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin:0 0 8px;">
      <tr>
        <td align="center" style="border:1px solid ${BRAND.line};border-radius:8px;
                                  background-color:${BRAND.white};padding:11px 16px;">
          <a href="${escapeHtml(url)}"
             style="display:inline-block;font-size:14px;font-weight:600;
                    color:${BRAND.ink};text-decoration:none;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/**
 * One "Add to Google Calendar" event for the whole booking: earliest session
 * start → latest end, each court listed in the event details.
 */
function mergedCalendarUrl(
  sessions: CourtSession[],
  trackingToken: string,
): string {
  const times = sessions
    .flatMap((s) => [new Date(s.startIso).getTime(), new Date(s.endIso).getTime()])
    .filter((t) => Number.isFinite(t));
  if (times.length < 2) return "";
  const ref = trackingToken ? `#${trackingToken.slice(0, 8).toUpperCase()}` : "";
  const trackingUrl = trackingToken ? bookingUrl(trackingToken) : null;
  return googleCalendarUrlForRange({
    title:
      sessions.length === 1 && sessions[0]
        ? `CK Grounds — ${sessions[0].court}`
        : `CK Grounds — ${sessions.length} courts`,
    startIso: new Date(Math.min(...times)).toISOString(),
    endIso: new Date(Math.max(...times)).toISOString(),
    location: VENUE_ADDRESS,
    details: [
      ref ? `Booking ref: ${ref}` : "",
      ...sessions.map((s) => `${s.court} — ${s.date}, ${s.timeRange}`),
      trackingUrl ? `View your booking: ${trackingUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

function calendarBlock(
  sessions: CourtSession[],
  trackingToken: string,
  note = "",
): string {
  const href = mergedCalendarUrl(sessions, trackingToken);
  if (!href) return "";
  const noteHtml = note
    ? `<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${BRAND.muted};">
         ${escapeHtml(note)}
       </p>`
    : "";
  return `${sectionLabel("Add to your calendar")}${noteHtml}${outlineButton("Add to Google Calendar", href)}`;
}

// Plain-text counterpart: raw calendar URLs are very long, so they go on their
// own indented line under a short label instead of inline in a sentence.
function textCalendar(
  sessions: CourtSession[],
  trackingToken: string,
  note = "",
): string[] {
  const href = mergedCalendarUrl(sessions, trackingToken);
  if (!href) return [];
  const head = note ? ["", "ADD TO GOOGLE CALENDAR", `  ${note}`] : ["", "ADD TO GOOGLE CALENDAR"];
  return [...head, `  ${href}`];
}

function statusBadge(text: string, bg: string, fg: string): string {
  return `<span style="display:inline-block;padding:4px 12px;border-radius:20px;
                        font-size:12px;font-weight:700;letter-spacing:0.5px;
                        background-color:${bg};color:${fg};">${escapeHtml(text)}</span>`;
}

function greeting(name: string): string {
  return `<p style="margin:0 0 20px;font-size:16px;color:${BRAND.ink};">
    Hi <strong>${escapeHtml(name)}</strong>,
  </p>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink};">
    ${escapeHtml(text)}
  </p>`;
}

function qrCard(cid: string | null, trackingUrl: string, alt: string): string {
  // Fallback: QR could not be generated — always give the customer a way in.
  if (!cid) {
    return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td style="background:${BRAND.cream};border:2px solid ${BRAND.line};
                   border-radius:12px;padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:13px;color:${BRAND.muted};">
            QR image unavailable — open your pass:
          </p>
          <a href="${escapeHtml(trackingUrl)}"
             style="font-size:13px;color:${BRAND.flame};text-decoration:none;word-break:break-all;">
            ${escapeHtml(trackingUrl)}
          </a>
        </td>
      </tr>
    </table>`;
  }
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td style="background:${BRAND.white};border:2px solid ${BRAND.line};
                   border-radius:12px;padding:16px;display:inline-block;">
          <img src="cid:${escapeHtml(cid)}" width="180" height="180"
               alt="${escapeHtml(alt)}" style="display:block;border:0;" />
        </td>
      </tr>
    </table>`;
}

// ---------------------------------------------------------------------------
// Plain-text helpers
// ---------------------------------------------------------------------------

function textSessions(sessions: CourtSession[]): string[] {
  return sessions.map((s) => `  ${s.court} — ${s.date}, ${s.timeRange} (${s.hours}h)`);
}

function textInvoice(
  lines: InvoiceLine[],
  total: string,
): string[] {
  const out = lines.flatMap((l) => [
    l.amount ? `  ${l.label}: ₱${l.amount}` : `  ${l.label}`,
    ...(l.detail ? [`    ${l.detail}`] : []),
  ]);
  if (total) out.push(`  ─────────────`, `  Total: ₱${total}`);
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function renderOutboxEmail(
  template: string,
  payload: Payload,
): Promise<RenderedEmail> {
  const trackingToken = str(payload.trackingToken);
  const fullName = str(payload.fullName, "there");
  const email = str(payload.email);
  const phone = str(payload.phone);
  const total = str(payload.total);
  const url = bookingUrl(trackingToken);
  const sessions = collapseSlots(payload);
  const lines = linesOf(payload, sessions);

  switch (template) {
    // -----------------------------------------------------------------------
    case OUTBOX_TEMPLATE_CUSTOMER_SUBMITTED: {
      const qrPngBuf = url ? await qrPng(url) : null;
      const qrCid = qrPngBuf ? `booking-qr-submitted@ckgrounds` : null;

      const textLines = [
        `Hi ${fullName},`,
        "",
        "We received your booking. Our team will verify your payment proof shortly.",
        "",
        `Name:  ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        "",
        "BOOKING",
        ...textSessions(sessions),
        "",
        "INVOICE",
        ...textInvoice(lines, total),
        ...textCalendar(
          sessions,
          trackingToken,
          "Your slot is not confirmed until we verify your payment proof.",
        ),
        ...(url ? ["", "Track your booking:", url] : []),
        "",
        "Keep your payment proof until your booking is confirmed.",
        "— CK Grounds",
      ];

      const htmlBody = `
        ${greeting(fullName)}
        <div style="margin-bottom:20px;">${statusBadge("Pending Review", BRAND.oat, BRAND.pine)}</div>
        ${p("We received your booking. Our team will verify your payment proof shortly.")}

        ${sectionLabel("Customer")}
        ${customerBlock(fullName, email, phone)}

        ${sectionLabel("Booking")}
        ${sessionsBlock(sessions)}

        ${lines.length || total ? `${sectionLabel("Invoice")}${invoiceBlock(lines, total)}` : ""}

        ${
          url
            ? `${sectionLabel("Track your booking")}
               ${p("Scan this QR code to check your booking status at any time.")}
               ${qrCard(qrCid, url, "Booking tracking QR code")}
               ${ctaButton("View Booking Status", url)}
               ${calendarBlock(
                 sessions,
                 trackingToken,
                 "Your slot is not confirmed until we verify your payment proof.",
               )}`
            : ""
        }

        <div style="margin-top:24px;padding:14px 16px;background-color:${BRAND.cream};
                    border-left:3px solid ${BRAND.flame};border-radius:0 6px 6px 0;">
          <p style="margin:0;font-size:13px;color:${BRAND.ink};line-height:1.5;">
            Keep your payment proof until your booking is confirmed.
          </p>
        </div>`;

      return {
        subject: "CK Grounds — booking received",
        text: textLines.join("\n"),
        html: emailShell({ preheader: "Your booking is pending review.", body: htmlBody }),
        attachments:
          qrPngBuf && qrCid ? [qrAttachment(qrPngBuf, qrCid)] : undefined,
      };
    }

    // -----------------------------------------------------------------------
    case OUTBOX_TEMPLATE_OWNER_ALERT: {
      const adminLink = adminUrl();
      const textLines = [
        `New booking from ${fullName} — action needed`,
        "Verify the payment proof, then approve or reject in the admin panel.",
        "",
        `Name:  ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        "",
        "BOOKING",
        ...textSessions(sessions),
        "",
        "INVOICE",
        ...textInvoice(lines, total),
        "",
        "Admin panel:",
        adminLink,
        ...(url ? ["", "Customer tracking link:", url] : []),
      ];

      const htmlBody = `
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${BRAND.pine};">
          New booking — action needed
        </h2>

        ${sectionLabel("Customer")}
        <table role="presentation" cellpadding="0" cellspacing="0"
               style="margin-bottom:24px;width:100%;">
          <tr>
            <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;width:56px;">Name</td>
            <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;font-weight:600;">
              ${escapeHtml(fullName)}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;">Email</td>
            <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;">
              <a href="mailto:${escapeHtml(email)}"
                 style="color:${BRAND.flame};text-decoration:none;">${escapeHtml(email)}</a>
            </td>
          </tr>
          <tr>
            <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;">Phone</td>
            <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;">${escapeHtml(phone)}</td>
          </tr>
        </table>

        ${sectionLabel("Booking")}
        ${sessionsBlock(sessions)}

        ${lines.length || total ? `${sectionLabel("Invoice")}${invoiceBlock(lines, total)}` : ""}

        ${ctaButton("Open Admin Panel", adminLink)}

        ${url ? `${sectionLabel("Customer tracking")}${ctaButton("Open Customer Tracking", url)}` : ""}`;

      return {
        subject: `CK Grounds — new booking from ${fullName || "customer"}`,
        text: textLines.join("\n"),
        html: emailShell({ preheader: `New booking from ${fullName}.`, body: htmlBody }),
      };
    }

    // -----------------------------------------------------------------------
    case OUTBOX_TEMPLATE_CUSTOMER_APPROVED: {
      const qrPngBuf = url ? await qrPng(url) : null;
      const qrCid = qrPngBuf ? `booking-qr-approved@ckgrounds` : null;

      const textLines = [
        `Hi ${fullName},`,
        "",
        "Your booking is confirmed. Show the QR code below at the venue to check in.",
        "",
        `Name:  ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        "",
        "BOOKING",
        ...textSessions(sessions),
        ...(lines.length || total ? ["", "INVOICE", ...textInvoice(lines, total)] : []),
        ...textCalendar(sessions, trackingToken),
        ...(url ? ["", "YOUR QR PASS", url] : []),
        "",
        "See you on the court!",
        "— CK Grounds",
      ];

      const qrSection = url
        ? `${sectionLabel("QR check-in pass")}
           ${p("Show this at the venue to check in.")}
           ${qrCard(qrCid, url, "QR check-in pass")}
           ${ctaButton("Open QR Pass", url)}
           ${calendarBlock(sessions, trackingToken)}`
        : "";

      const htmlBody = `
        ${greeting(fullName)}
        <div style="margin-bottom:20px;">${statusBadge("Confirmed", BRAND.liveBg, BRAND.liveGreen)}</div>
        ${p("Your booking is confirmed. Show the QR code below at the venue to check in.")}

        ${sectionLabel("Customer")}
        ${customerBlock(fullName, email, phone)}

        ${sectionLabel("Booking")}
        ${sessionsBlock(sessions)}

        ${lines.length || total ? `${sectionLabel("Invoice")}${invoiceBlock(lines, total)}` : ""}

        ${qrSection}`;

      return {
        subject: "CK Grounds — booking confirmed",
        text: textLines.join("\n"),
        html: emailShell({
          preheader: "Your booking is confirmed — QR pass inside.",
          body: htmlBody,
        }),
        attachments:
          qrPngBuf && qrCid ? [qrAttachment(qrPngBuf, qrCid)] : undefined,
      };
    }

    // -----------------------------------------------------------------------
    case OUTBOX_TEMPLATE_CUSTOMER_REJECTED: {
      const reason = str(payload.rejectReason, "No reason provided.");
      const qrPngBuf = url ? await qrPng(url) : null;
      const qrCid = qrPngBuf ? `booking-qr-rejected@ckgrounds` : null;

      const textLines = [
        `Hi ${fullName},`,
        "",
        "Your booking was not approved and your slots have been released.",
        "",
        `Name:  ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        "",
        "BOOKING",
        ...textSessions(sessions),
        "",
        `Reason: ${reason}`,
        "",
        ...(url ? ["Booking reference:", url, ""] : []),
        "If you believe this is a mistake, reply to this email.",
        "— CK Grounds",
      ];

      const htmlBody = `
        ${greeting(fullName)}
        <div style="margin-bottom:20px;">${statusBadge("Not Approved", BRAND.errorBg, BRAND.errorRed)}</div>
        ${p("Your booking was not approved and your slots have been released.")}

        ${sectionLabel("Customer")}
        ${customerBlock(fullName, email, phone)}

        ${sectionLabel("Booking")}
        ${sessionsBlock(sessions)}

        <div style="margin-bottom:24px;padding:14px 16px;background-color:${BRAND.errorBg};
                    border-left:3px solid ${BRAND.errorRed};border-radius:0 6px 6px 0;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.8px;
                    text-transform:uppercase;color:${BRAND.errorRed};">Reason</p>
          <p style="margin:0;font-size:14px;color:${BRAND.ink};line-height:1.5;">
            ${escapeHtml(reason)}
          </p>
        </div>

        ${
          url
            ? `${sectionLabel("Booking reference")}
               ${p("Scan this QR code to view this booking's status.")}
               ${qrCard(qrCid, url, "Booking reference QR code")}
               ${ctaButton("View Booking", url)}`
            : ""
        }

        ${p("If you believe this is a mistake or would like to re-book, reply to this email.")}`;

      return {
        subject: "CK Grounds — booking not approved",
        text: textLines.join("\n"),
        html: emailShell({
          preheader: "Your booking could not be confirmed.",
          body: htmlBody,
        }),
        attachments:
          qrPngBuf && qrCid ? [qrAttachment(qrPngBuf, qrCid)] : undefined,
      };
    }

    // -----------------------------------------------------------------------
    default:
      throw new Error(`UNKNOWN_TEMPLATE:${template}`);
  }
}
